/**
 * Purroxy API — Cloudflare Worker
 * Handles auth, subscriptions, Stripe, submissions, and community library
 */

import {
  hashPassword, verifyPassword, createToken, verifyToken,
  authenticateRequest, checkRateLimit, generateToken
} from './lib/auth'
import { sendVerificationEmail, sendPasswordResetEmail } from './lib/email'
import type Stripe from 'stripe'
import {
  getStripe, createCheckoutSession, createBillingPortalSession,
  handleSubscriptionEvent, grantContributorAccess
} from './lib/stripe'
import {
  createSubmissionPR, verifyGitHubWebhook, deleteBranch
} from './lib/github'
import {
  sendSubmissionApprovedEmail, sendSubmissionRejectedEmail
} from './lib/email'

export interface Env {
  DB: D1Database
  KV?: KVNamespace
  TRIAL_DAYS: string
  APP_URL: string
  JWT_SECRET?: string
  RESEND_API_KEY?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_PRICE_ID?: string
  GITHUB_TOKEN?: string
  GITHUB_REPO?: string
  GITHUB_WEBHOOK_SECRET?: string
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}

function cors(): Response {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return cors()

    const url = new URL(request.url)
    const path = url.pathname

    try {
      // Auth routes
      if (path === '/api/signup' && request.method === 'POST') {
        return handleSignup(request, env)
      }
      if (path === '/api/login' && request.method === 'POST') {
        return handleLogin(request, env)
      }
      if (path === '/api/validate' && request.method === 'GET') {
        return handleValidate(request, env)
      }
      if (path === '/api/auth/verify-email' && request.method === 'GET') {
        return handleVerifyEmail(request, env)
      }
      if (path === '/api/auth/resend-verification' && request.method === 'POST') {
        return handleResendVerification(request, env)
      }
      if (path === '/api/auth/forgot-password' && request.method === 'POST') {
        return handleForgotPassword(request, env)
      }
      if (path === '/api/auth/reset-password' && request.method === 'POST') {
        return handleResetPassword(request, env)
      }
      if (path === '/api/status' && request.method === 'GET') {
        return handleStatus(env)
      }

      // Stripe routes
      if (path === '/api/stripe/create-checkout' && request.method === 'POST') {
        return handleStripeCheckout(request, env)
      }
      if (path === '/api/stripe/portal' && request.method === 'POST') {
        return handleStripePortal(request, env)
      }
      if (path === '/api/stripe/webhook' && request.method === 'POST') {
        return handleStripeWebhook(request, env)
      }
      if (path === '/api/stripe/status' && request.method === 'GET') {
        return handleStripeStatus(request, env)
      }

      // Submissions
      if (path === '/api/submissions' && request.method === 'POST') {
        return handleSubmissionCreate(request, env)
      }
      if (path === '/api/submissions' && request.method === 'GET') {
        return handleSubmissionList(request, env)
      }
      if (path === '/api/github/webhook' && request.method === 'POST') {
        return handleGitHubWebhook(request, env)
      }

      // Community library
      if (path === '/api/community' && request.method === 'GET') {
        return handleCommunityList(request, env)
      }
      if (path === '/api/community/publish' && request.method === 'POST') {
        return handleCommunityPublish(request, env)
      }
      if (path.startsWith('/api/community/') && request.method === 'GET') {
        const id = path.split('/').pop()
        return handleCommunityGet(id!, env)
      }
      if (path === '/api/community/install' && request.method === 'POST') {
        return handleCommunityInstall(request, env)
      }

      return json({ error: 'Not found' }, 404)
    } catch (err: any) {
      console.error('[api] Error:', err.message)
      return json({ error: 'Internal server error' }, 500)
    }
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

async function handleSignup(request: Request, env: Env): Promise<Response> {
  // Rate limit by IP
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const { allowed } = await checkRateLimit(env.KV, `signup:${ip}`)
  if (!allowed) return json({ error: 'Too many attempts. Try again in a minute.' }, 429)

  const { email, password } = await request.json() as { email: string; password: string }

  if (!email || !password) return json({ error: 'Email and password required' }, 400)
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email.toLowerCase()).first()
  if (existing) return json({ error: 'Email already registered' }, 409)

  const id = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  const trialDays = parseInt(env.TRIAL_DAYS || '14')
  const trialEnds = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString()

  // Generate verification token
  const verifyTokenValue = generateToken()
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h

  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, verify_token, verify_token_expires) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, email.toLowerCase(), passwordHash, verifyTokenValue, verifyExpires),
    env.DB.prepare(
      'INSERT INTO subscriptions (id, user_id, status, plan, trial_ends_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), id, 'trial', 'trial', trialEnds)
  ])

  // Send verification email
  if (env.RESEND_API_KEY) {
    await sendVerificationEmail(env.RESEND_API_KEY, email.toLowerCase(), verifyTokenValue, env.APP_URL)
  }

  const token = await createToken(id, env.JWT_SECRET || 'dev-secret')
  return json({
    token,
    user: { id, email: email.toLowerCase() },
    trialEndsAt: trialEnds,
    needsVerification: true
  }, 201)
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const { allowed } = await checkRateLimit(env.KV, `login:${ip}`)
  if (!allowed) return json({ error: 'Too many attempts. Try again in a minute.' }, 429)

  const { email, password } = await request.json() as { email: string; password: string }
  if (!email || !password) return json({ error: 'Email and password required' }, 400)

  const user = await env.DB.prepare('SELECT id, email, password_hash, email_verified FROM users WHERE email = ?')
    .bind(email.toLowerCase()).first<{ id: string; email: string; password_hash: string; email_verified: number }>()

  if (!user) return json({ error: 'Invalid email or password' }, 401)

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) return json({ error: 'Invalid email or password' }, 401)

  const token = await createToken(user.id, env.JWT_SECRET || 'dev-secret')

  const sub = await env.DB.prepare(
    'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(user.id).first()

  return json({
    token,
    user: { id: user.id, email: user.email, emailVerified: !!user.email_verified },
    subscription: sub
  })
}

async function handleValidate(request: Request, env: Env): Promise<Response> {
  const userId = await authenticateRequest(request, env)
  if (!userId) return json({ valid: false, error: 'Invalid or expired token' }, 401)

  // Check KV cache first
  if (env.KV) {
    const cached = await env.KV.get(`license:${userId}`)
    if (cached) return json(JSON.parse(cached))
  }

  const sub = await env.DB.prepare(
    'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(userId).first<any>()

  if (!sub) return json({ valid: false, error: 'No subscription' }, 403)

  const now = new Date().toISOString()
  const isActive = sub.status === 'active' || sub.status === 'contributor' ||
    (sub.status === 'trial' && sub.trial_ends_at > now)

  const result = {
    valid: isActive,
    subscription: {
      status: sub.status,
      plan: sub.plan,
      trialEndsAt: sub.trial_ends_at
    }
  }

  // Cache for 5 minutes
  if (env.KV) {
    await env.KV.put(`license:${userId}`, JSON.stringify(result), { expirationTtl: 300 })
  }

  return json(result)
}

async function handleVerifyEmail(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) return json({ error: 'Missing token' }, 400)

  const user = await env.DB.prepare(
    'SELECT id, verify_token_expires FROM users WHERE verify_token = ?'
  ).bind(token).first<{ id: string; verify_token_expires: string }>()

  if (!user) return json({ error: 'Invalid or expired verification link' }, 400)

  if (new Date(user.verify_token_expires) < new Date()) {
    return json({ error: 'Verification link has expired. Request a new one.' }, 400)
  }

  await env.DB.prepare(
    "UPDATE users SET email_verified = 1, verify_token = NULL, verify_token_expires = NULL, updated_at = datetime('now') WHERE id = ?"
  ).bind(user.id).run()

  // Redirect to a simple success page or return JSON
  return new Response(
    '<html><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;"><div style="text-align:center"><h2>Email Verified</h2><p>You can close this tab and return to the app.</p></div></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  )
}

async function handleResendVerification(request: Request, env: Env): Promise<Response> {
  const userId = await authenticateRequest(request, env)
  if (!userId) return json({ error: 'Not authenticated' }, 401)

  const user = await env.DB.prepare('SELECT email, email_verified FROM users WHERE id = ?')
    .bind(userId).first<{ email: string; email_verified: number }>()

  if (!user) return json({ error: 'User not found' }, 404)
  if (user.email_verified) return json({ message: 'Email already verified' })

  const verifyTokenValue = generateToken()
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  await env.DB.prepare(
    "UPDATE users SET verify_token = ?, verify_token_expires = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(verifyTokenValue, verifyExpires, userId).run()

  if (env.RESEND_API_KEY) {
    await sendVerificationEmail(env.RESEND_API_KEY, user.email, verifyTokenValue, env.APP_URL)
  }

  return json({ message: 'Verification email sent' })
}

async function handleForgotPassword(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const { allowed } = await checkRateLimit(env.KV, `reset:${ip}`)
  if (!allowed) return json({ error: 'Too many attempts. Try again in a minute.' }, 429)

  const { email } = await request.json() as { email: string }
  if (!email) return json({ error: 'Email required' }, 400)

  // Always return same message for security
  const successMsg = { message: 'If an account exists with that email, a reset link has been sent.' }

  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email.toLowerCase()).first<{ id: string }>()
  if (!user) return json(successMsg)

  const resetToken = generateToken()
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

  await env.DB.prepare(
    "UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(resetToken, expires, user.id).run()

  if (env.RESEND_API_KEY) {
    await sendPasswordResetEmail(env.RESEND_API_KEY, email.toLowerCase(), resetToken, env.APP_URL)
  }

  return json(successMsg)
}

async function handleResetPassword(request: Request, env: Env): Promise<Response> {
  const { token, password } = await request.json() as { token: string; password: string }

  if (!token || !password) return json({ error: 'Token and new password required' }, 400)
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)

  const user = await env.DB.prepare(
    'SELECT id, reset_token_expires FROM users WHERE reset_token = ?'
  ).bind(token).first<{ id: string; reset_token_expires: string }>()

  if (!user) return json({ error: 'Invalid or expired reset link' }, 400)

  if (new Date(user.reset_token_expires) < new Date()) {
    return json({ error: 'Reset link has expired. Request a new one.' }, 400)
  }

  const passwordHash = await hashPassword(password)

  await env.DB.prepare(
    "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = datetime('now') WHERE id = ?"
  ).bind(passwordHash, user.id).run()

  return json({ message: 'Password has been reset. You can now log in.' })
}

async function handleStatus(env: Env): Promise<Response> {
  return json({ status: 'ok', version: '0.2.0' })
}

// ─── Stripe ──────────────────────────────────────────────────────────────────

async function handleStripeCheckout(request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
    return json({ error: 'Stripe not configured' }, 503)
  }

  const userId = await authenticateRequest(request, env)
  if (!userId) return json({ error: 'Not authenticated' }, 401)

  const user = await env.DB.prepare('SELECT email FROM users WHERE id = ?')
    .bind(userId).first<{ email: string }>()
  if (!user) return json({ error: 'User not found' }, 404)

  const stripe = getStripe(env.STRIPE_SECRET_KEY)
  const trialDays = parseInt(env.TRIAL_DAYS || '14')

  const url = await createCheckoutSession(
    stripe, env.DB, userId, user.email,
    env.STRIPE_PRICE_ID, env.APP_URL, trialDays
  )

  return json({ url })
}

async function handleStripePortal(request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'Stripe not configured' }, 503)
  }

  const userId = await authenticateRequest(request, env)
  if (!userId) return json({ error: 'Not authenticated' }, 401)

  const stripe = getStripe(env.STRIPE_SECRET_KEY)
  const url = await createBillingPortalSession(stripe, env.DB, userId, env.APP_URL)

  if (!url) return json({ error: 'No billing account found. Subscribe first.' }, 400)
  return json({ url })
}

async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return json({ error: 'Stripe not configured' }, 503)
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) return json({ error: 'Missing Stripe signature' }, 400)

  const rawBody = await request.text()
  const stripe = getStripe(env.STRIPE_SECRET_KEY)

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody, signature, env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err: any) {
    console.error('[stripe] Webhook verification failed:', err.message)
    return json({ error: 'Invalid signature' }, 400)
  }

  try {
    await handleSubscriptionEvent(env.DB, env.KV, event)
  } catch (err: any) {
    console.error('[stripe] Error handling event:', err.message)
    return json({ error: 'Webhook handler failed' }, 500)
  }

  return json({ received: true })
}

async function handleStripeStatus(request: Request, env: Env): Promise<Response> {
  const userId = await authenticateRequest(request, env)
  if (!userId) return json({ error: 'Not authenticated' }, 401)

  // Bypass cache — always get fresh status for post-checkout refresh
  const sub = await env.DB.prepare(
    'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(userId).first<any>()

  if (!sub) return json({ error: 'No subscription' }, 404)

  const now = new Date().toISOString()
  const isActive = sub.status === 'active' || sub.status === 'contributor' ||
    (sub.status === 'trial' && sub.trial_ends_at > now)

  return json({
    valid: isActive,
    subscription: {
      status: sub.status,
      plan: sub.plan,
      trialEndsAt: sub.trial_ends_at,
      stripeCustomerId: sub.stripe_customer_id ? true : false // don't leak actual ID
    }
  })
}

// ─── Submissions ─────────────────────────────────────────────────────────────

async function handleSubmissionCreate(request: Request, env: Env): Promise<Response> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return json({ error: 'GitHub integration not configured' }, 503)
  }

  const userId = await authenticateRequest(request, env)
  if (!userId) return json({ error: 'Not authenticated' }, 401)

  const user = await env.DB.prepare('SELECT email FROM users WHERE id = ?')
    .bind(userId).first<{ email: string }>()
  if (!user) return json({ error: 'User not found' }, 404)

  const body = await request.json() as any
  const { name, description, hostname, actions, parameters, extractionRules, viewport } = body

  if (!name || !hostname || !actions) {
    return json({ error: 'Missing required fields: name, hostname, actions' }, 400)
  }

  const submissionId = crypto.randomUUID()

  // Create GitHub PR
  let pr: { prNumber: number; prUrl: string }
  try {
    pr = await createSubmissionPR(
      env.GITHUB_TOKEN, env.GITHUB_REPO, submissionId,
      name, hostname, user.email,
      { name, description: description || '', hostname, actions, parameters: parameters || [], extractionRules: extractionRules || [], viewport: viewport || null }
    )
  } catch (err: any) {
    console.error('[submissions] Failed to create PR:', err.message)
    return json({ error: 'Failed to create submission. Please try again.' }, 500)
  }

  // Store submission record
  await env.DB.prepare(
    'INSERT INTO submissions (id, user_id, capability_name, hostname, github_pr_number, github_pr_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(submissionId, userId, name, hostname, pr.prNumber, pr.prUrl, 'pending').run()

  return json({
    submissionId,
    status: 'pending',
    githubPr: { number: pr.prNumber, url: pr.prUrl },
    message: 'Submitted! A PR has been created for review. When approved, you get free access forever.'
  }, 201)
}

async function handleSubmissionList(request: Request, env: Env): Promise<Response> {
  const userId = await authenticateRequest(request, env)
  if (!userId) return json({ error: 'Not authenticated' }, 401)

  const results = await env.DB.prepare(
    'SELECT * FROM submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).bind(userId).all()

  return json({
    submissions: results.results.map((s: any) => ({
      id: s.id,
      capabilityName: s.capability_name,
      hostname: s.hostname,
      status: s.status,
      githubPrUrl: s.github_pr_url,
      rejectionReason: s.rejection_reason,
      createdAt: s.created_at
    }))
  })
}

async function handleGitHubWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.GITHUB_WEBHOOK_SECRET) {
    return json({ error: 'GitHub webhook not configured' }, 503)
  }

  const signature = request.headers.get('x-hub-signature-256')
  if (!signature) return json({ error: 'Missing signature' }, 400)

  const rawBody = await request.text()
  const valid = await verifyGitHubWebhook(rawBody, signature, env.GITHUB_WEBHOOK_SECRET)
  if (!valid) return json({ error: 'Invalid signature' }, 400)

  const event = request.headers.get('x-github-event')
  if (event !== 'pull_request') return json({ ok: true })

  const payload = JSON.parse(rawBody) as any
  const action = payload.action
  const prNumber = payload.pull_request?.number
  const merged = payload.pull_request?.merged

  if (!prNumber) return json({ ok: true })

  // Find submission by PR number
  const submission = await env.DB.prepare(
    'SELECT s.*, u.email FROM submissions s JOIN users u ON s.user_id = u.id WHERE s.github_pr_number = ?'
  ).bind(prNumber).first<any>()

  if (!submission) return json({ ok: true })

  if (action === 'closed' && merged) {
    // PR merged — approve submission and grant contributor access
    await env.DB.prepare(
      "UPDATE submissions SET status = 'approved' WHERE id = ?"
    ).bind(submission.id).run()

    // Grant contributor access (cancels Stripe subscription if exists)
    const stripe = env.STRIPE_SECRET_KEY ? getStripe(env.STRIPE_SECRET_KEY) : null
    await grantContributorAccess(stripe, env.DB, env.KV, submission.user_id)

    // Also add to community library as approved
    // (The capability data is in the PR, we store a reference)
    await env.DB.prepare(
      "UPDATE community_capabilities SET status = 'approved', updated_at = datetime('now') WHERE user_id = ? AND name = ? AND status = 'pending'"
    ).bind(submission.user_id, submission.capability_name).run()

    // Send approval email
    if (env.RESEND_API_KEY) {
      await sendSubmissionApprovedEmail(env.RESEND_API_KEY, submission.email, submission.capability_name)
    }

    // Clean up submission branch
    if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
      const branchName = payload.pull_request?.head?.ref
      if (branchName) {
        try { await deleteBranch(env.GITHUB_TOKEN, env.GITHUB_REPO, branchName) } catch {}
      }
    }
  } else if (action === 'closed' && !merged) {
    // PR closed without merge — rejection
    const lastComment = payload.pull_request?.body || 'No reason provided'

    await env.DB.prepare(
      "UPDATE submissions SET status = 'rejected', rejection_reason = ? WHERE id = ?"
    ).bind(lastComment, submission.id).run()

    if (env.RESEND_API_KEY) {
      await sendSubmissionRejectedEmail(
        env.RESEND_API_KEY, submission.email,
        submission.capability_name, lastComment
      )
    }

    // Clean up branch
    if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
      const branchName = payload.pull_request?.head?.ref
      if (branchName) {
        try { await deleteBranch(env.GITHUB_TOKEN, env.GITHUB_REPO, branchName) } catch {}
      }
    }
  }

  return json({ ok: true })
}

// ─── Community Library ───────────────────────────────────────────────────────

async function handleCommunityList(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const search = url.searchParams.get('q') || ''
  const hostname = url.searchParams.get('hostname') || ''

  let query = 'SELECT c.*, u.email as author_email FROM community_capabilities c JOIN users u ON c.user_id = u.id WHERE c.status = ?'
  const params: string[] = ['approved']

  if (search) {
    query += ' AND (c.name LIKE ? OR c.description LIKE ?)'
    params.push(`%${search}%`, `%${search}%`)
  }
  if (hostname) {
    query += ' AND c.hostname = ?'
    params.push(hostname)
  }

  query += ' ORDER BY c.install_count DESC, c.created_at DESC LIMIT 50'

  const stmt = env.DB.prepare(query)
  const results = await stmt.bind(...params).all()

  return json({
    capabilities: results.results.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      hostname: r.hostname,
      authorEmail: r.author_email,
      installCount: r.install_count,
      createdAt: r.created_at
    }))
  })
}

async function handleCommunityPublish(request: Request, env: Env): Promise<Response> {
  const userId = await authenticateRequest(request, env)
  if (!userId) return json({ error: 'Login required' }, 401)

  const body = await request.json() as any
  const { name, description, hostname, actions, parameters, extractionRules, viewport } = body

  if (!name || !hostname || !actions) return json({ error: 'Missing required fields' }, 400)

  const id = crypto.randomUUID()
  await env.DB.prepare(
    'INSERT INTO community_capabilities (id, user_id, name, description, hostname, actions_json, parameters_json, extraction_rules_json, viewport_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, userId, name, description || '', hostname,
    JSON.stringify(actions), JSON.stringify(parameters || []),
    JSON.stringify(extractionRules || []), JSON.stringify(viewport || null)
  ).run()

  // Grant contributor access if on trial
  const existingSub = await env.DB.prepare(
    'SELECT id, plan FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(userId).first<any>()

  if (existingSub && existingSub.plan === 'trial') {
    await env.DB.prepare("UPDATE subscriptions SET plan = ?, status = ?, updated_at = datetime('now') WHERE id = ?")
      .bind('contributor', 'contributor', existingSub.id).run()

    // Invalidate license cache
    if (env.KV) await env.KV.delete(`license:${userId}`)
  }

  return json({ id, status: 'pending', message: 'Submitted for review. Publishing grants free contributor access!' })
}

async function handleCommunityGet(id: string, env: Env): Promise<Response> {
  const cap = await env.DB.prepare(
    'SELECT c.*, u.email as author_email FROM community_capabilities c JOIN users u ON c.user_id = u.id WHERE c.id = ?'
  ).bind(id).first<any>()

  if (!cap) return json({ error: 'Not found' }, 404)

  return json({
    id: cap.id,
    name: cap.name,
    description: cap.description,
    hostname: cap.hostname,
    authorEmail: cap.author_email,
    actions: JSON.parse(cap.actions_json),
    parameters: JSON.parse(cap.parameters_json),
    extractionRules: JSON.parse(cap.extraction_rules_json),
    viewport: JSON.parse(cap.viewport_json || 'null'),
    installCount: cap.install_count,
    status: cap.status,
    createdAt: cap.created_at
  })
}

async function handleCommunityInstall(request: Request, env: Env): Promise<Response> {
  const { id } = await request.json() as { id: string }
  if (!id) return json({ error: 'Missing capability ID' }, 400)

  const cap = await env.DB.prepare('SELECT * FROM community_capabilities WHERE id = ? AND status = ?')
    .bind(id, 'approved').first<any>()
  if (!cap) return json({ error: 'Capability not found or not approved' }, 404)

  await env.DB.prepare('UPDATE community_capabilities SET install_count = install_count + 1 WHERE id = ?').bind(id).run()

  return json({
    name: cap.name,
    description: cap.description,
    hostname: cap.hostname,
    actions: JSON.parse(cap.actions_json),
    parameters: JSON.parse(cap.parameters_json),
    extractionRules: JSON.parse(cap.extraction_rules_json),
    viewport: JSON.parse(cap.viewport_json || 'null')
  })
}
