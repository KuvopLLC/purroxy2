import { describe, it, expect, beforeEach } from 'vitest'
import {
  createCheckoutSession,
  createBillingPortalSession,
  handleSubscriptionEvent,
  grantContributorAccess,
} from '../../src/lib/stripe'
import { createMockD1 } from '../mocks/d1-mock'
import { createMockKV } from '../mocks/kv-mock'
import { createMockStripe } from '../mocks/stripe-mock'

let db: ReturnType<typeof createMockD1>
let kv: ReturnType<typeof createMockKV>
let stripe: ReturnType<typeof createMockStripe>

beforeEach(() => {
  db = createMockD1()
  kv = createMockKV()
  stripe = createMockStripe()
})

// ─── createCheckoutSession ────────────────────────────────────────────────────

describe('createCheckoutSession', () => {
  it('creates a Stripe customer when none exists', async () => {
    // No existing subscription with customer ID
    db.setResult(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      null
    )

    const url = await createCheckoutSession(
      stripe as any, db as any, 'user-1', 'user@test.com', 'price_123', 'https://app.purroxy.com', 14
    )

    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: 'user@test.com',
      metadata: { userId: 'user-1' },
    })
    expect(url).toBe('https://checkout.stripe.com/test')
  })

  it('uses existing customer when one exists', async () => {
    db.setResult(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      { stripe_customer_id: 'cus_existing' }
    )

    await createCheckoutSession(
      stripe as any, db as any, 'user-1', 'user@test.com', 'price_123', 'https://app.purroxy.com', 14
    )

    expect(stripe.customers.create).not.toHaveBeenCalled()
  })

  it('creates session with trial days', async () => {
    db.setResult(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      { stripe_customer_id: 'cus_existing' }
    )

    await createCheckoutSession(
      stripe as any, db as any, 'user-1', 'user@test.com', 'price_123', 'https://app.purroxy.com', 7
    )

    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_existing',
        mode: 'subscription',
        subscription_data: expect.objectContaining({
          trial_period_days: 7,
        }),
      })
    )
  })

  it('passes correct line_items and URLs', async () => {
    db.setResult(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      { stripe_customer_id: 'cus_existing' }
    )

    await createCheckoutSession(
      stripe as any, db as any, 'user-1', 'user@test.com', 'price_xyz', 'https://myapp.com', 14
    )

    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_xyz', quantity: 1 }],
        success_url: 'https://myapp.com/checkout-success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://myapp.com/checkout-cancel',
      })
    )
  })
})

// ─── createBillingPortalSession ───────────────────────────────────────────────

describe('createBillingPortalSession', () => {
  it('returns portal URL when customer exists', async () => {
    db.setResult(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      { stripe_customer_id: 'cus_existing' }
    )

    const url = await createBillingPortalSession(
      stripe as any, db as any, 'user-1', 'https://app.purroxy.com'
    )

    expect(url).toBe('https://billing.stripe.com/test')
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_existing',
      return_url: 'https://app.purroxy.com/billing',
    })
  })

  it('returns null when no customer exists', async () => {
    db.setResult(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      null
    )

    const url = await createBillingPortalSession(
      stripe as any, db as any, 'user-1', 'https://app.purroxy.com'
    )

    expect(url).toBeNull()
  })

  it('returns null when stripe_customer_id is null in subscription', async () => {
    db.setResult(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      { stripe_customer_id: null }
    )

    const url = await createBillingPortalSession(
      stripe as any, db as any, 'user-1', 'https://app.purroxy.com'
    )

    expect(url).toBeNull()
  })
})

// ─── handleSubscriptionEvent ──────────────────────────────────────────────────

describe('handleSubscriptionEvent', () => {
  it('sets status to active on subscription.created with active status', async () => {
    const event = {
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_test',
          status: 'active',
        },
      },
    }

    await handleSubscriptionEvent(db as any, kv as any, event as any)

    const queries = db.getQueries()
    const updateQuery = queries.find(q => q.sql.includes('UPDATE subscriptions SET status'))
    expect(updateQuery).toBeDefined()
    expect(updateQuery!.bindings[0]).toBe('active')
  })

  it('sets status to active on subscription.updated with trialing status', async () => {
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_test',
          status: 'trialing',
        },
      },
    }

    await handleSubscriptionEvent(db as any, kv as any, event as any)

    const queries = db.getQueries()
    const updateQuery = queries.find(q => q.sql.includes('UPDATE subscriptions SET status'))
    expect(updateQuery).toBeDefined()
    expect(updateQuery!.bindings[0]).toBe('active')
  })

  it('passes through non-active/trialing statuses', async () => {
    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_test',
          status: 'past_due',
        },
      },
    }

    await handleSubscriptionEvent(db as any, kv as any, event as any)

    const queries = db.getQueries()
    const updateQuery = queries.find(q => q.sql.includes('UPDATE subscriptions SET status'))
    expect(updateQuery).toBeDefined()
    expect(updateQuery!.bindings[0]).toBe('past_due')
  })

  it('sets canceled status on subscription.deleted', async () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_test',
          status: 'canceled',
        },
      },
    }

    await handleSubscriptionEvent(db as any, kv as any, event as any)

    const queries = db.getQueries()
    const updateQuery = queries.find(q => q.sql.includes("status = 'canceled'"))
    expect(updateQuery).toBeDefined()
  })

  it('skips contributors on subscription.deleted', async () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_test',
          status: 'canceled',
        },
      },
    }

    await handleSubscriptionEvent(db as any, kv as any, event as any)

    const queries = db.getQueries()
    const updateQuery = queries.find(q => q.sql.includes("plan != 'contributor'"))
    expect(updateQuery).toBeDefined()
  })

  it('invalidates KV cache after subscription.created', async () => {
    // Set up db to return a user_id for the customer
    db.setResult(
      'SELECT user_id FROM subscriptions WHERE stripe_customer_id = ?',
      { user_id: 'user-cache-test' }
    )

    // Pre-populate cache
    await kv.put('license:user-cache-test', '{"valid":true}')

    const event = {
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_test',
          status: 'active',
        },
      },
    }

    await handleSubscriptionEvent(db as any, kv as any, event as any)

    const cached = await kv.get('license:user-cache-test')
    expect(cached).toBeNull()
  })

  it('does nothing for unknown event types', async () => {
    const event = {
      type: 'invoice.paid',
      data: { object: {} },
    }

    await handleSubscriptionEvent(db as any, kv as any, event as any)

    const queries = db.getQueries()
    expect(queries.length).toBe(0)
  })
})

// ─── grantContributorAccess ───────────────────────────────────────────────────

describe('grantContributorAccess', () => {
  it('updates DB to contributor plan and status', async () => {
    await grantContributorAccess(null, db as any, kv as any, 'user-1')

    const queries = db.getQueries()
    const updateQuery = queries.find(q => q.sql.includes("plan = 'contributor'"))
    expect(updateQuery).toBeDefined()
    expect(updateQuery!.bindings).toContain('user-1')
  })

  it('cancels active Stripe subscriptions', async () => {
    db.setResult(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      { stripe_customer_id: 'cus_with_sub' }
    )

    stripe.subscriptions.list
      .mockResolvedValueOnce({ data: [{ id: 'sub_active_1' }] }) // active
      .mockResolvedValueOnce({ data: [] }) // trialing

    await grantContributorAccess(stripe as any, db as any, kv as any, 'user-1')

    expect(stripe.subscriptions.list).toHaveBeenCalledWith({
      customer: 'cus_with_sub',
      status: 'active',
    })
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_active_1')
  })

  it('cancels trialing Stripe subscriptions', async () => {
    db.setResult(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      { stripe_customer_id: 'cus_with_trial' }
    )

    stripe.subscriptions.list
      .mockResolvedValueOnce({ data: [] }) // active
      .mockResolvedValueOnce({ data: [{ id: 'sub_trialing_1' }] }) // trialing

    await grantContributorAccess(stripe as any, db as any, kv as any, 'user-1')

    expect(stripe.subscriptions.list).toHaveBeenCalledWith({
      customer: 'cus_with_trial',
      status: 'trialing',
    })
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_trialing_1')
  })

  it('no-ops Stripe cancellation when no Stripe customer', async () => {
    db.setResult(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      null
    )

    await grantContributorAccess(stripe as any, db as any, kv as any, 'user-1')

    expect(stripe.subscriptions.list).not.toHaveBeenCalled()
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled()
  })

  it('skips Stripe calls when stripe is null', async () => {
    await grantContributorAccess(null, db as any, kv as any, 'user-1')

    expect(stripe.subscriptions.list).not.toHaveBeenCalled()
  })

  it('invalidates KV license cache', async () => {
    await kv.put('license:user-1', '{"valid":true}')

    await grantContributorAccess(null, db as any, kv as any, 'user-1')

    const cached = await kv.get('license:user-1')
    expect(cached).toBeNull()
  })
})
