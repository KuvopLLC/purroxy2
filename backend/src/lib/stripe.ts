import Stripe from 'stripe'
import type { Env } from '../index'

export function getStripe(secretKey: string): Stripe {
  return new Stripe(secretKey)
}

export async function createCheckoutSession(
  stripe: Stripe,
  db: D1Database,
  userId: string,
  email: string,
  priceId: string,
  appUrl: string,
  trialDays: number
): Promise<string> {
  // Look up existing Stripe customer ID
  const sub = await db
    .prepare('SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(userId)
    .first<{ stripe_customer_id: string | null }>()

  let customerId = sub?.stripe_customer_id

  // Create Stripe customer if needed
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { userId }
    })
    customerId = customer.id
    await db
      .prepare("UPDATE subscriptions SET stripe_customer_id = ?, updated_at = datetime('now') WHERE user_id = ?")
      .bind(customerId, userId)
      .run()
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: trialDays,
      metadata: { userId }
    },
    success_url: `${appUrl}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/checkout-cancel`,
    metadata: { userId }
  })

  return session.url!
}

export async function createBillingPortalSession(
  stripe: Stripe,
  db: D1Database,
  userId: string,
  appUrl: string
): Promise<string | null> {
  const sub = await db
    .prepare('SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(userId)
    .first<{ stripe_customer_id: string | null }>()

  if (!sub?.stripe_customer_id) return null

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${appUrl}/billing`
  })

  return session.url
}

export async function handleSubscriptionEvent(
  db: D1Database,
  kv: KVNamespace | undefined,
  event: Stripe.Event
): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = sub.customer as string
      const status = sub.status === 'active' || sub.status === 'trialing' ? 'active' : sub.status

      await db
        .prepare(
          `UPDATE subscriptions SET status = ?, plan = 'monthly', stripe_subscription_id = ?, updated_at = datetime('now')
           WHERE stripe_customer_id = ?`
        )
        .bind(status, sub.id, customerId)
        .run()

      await invalidateKVCache(db, kv, customerId)
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = sub.customer as string

      // Don't downgrade approved contributors — they keep access
      await db
        .prepare(
          `UPDATE subscriptions SET status = 'canceled', updated_at = datetime('now')
           WHERE stripe_customer_id = ? AND plan != 'contributor'`
        )
        .bind(customerId)
        .run()

      await invalidateKVCache(db, kv, customerId)
      break
    }
  }
}

export async function grantContributorAccess(
  stripe: Stripe | null,
  db: D1Database,
  kv: KVNamespace | undefined,
  userId: string
): Promise<void> {
  // Mark user as approved contributor with permanent access
  await db
    .prepare(
      `UPDATE subscriptions SET plan = 'contributor', status = 'contributor', updated_at = datetime('now')
       WHERE user_id = ?`
    )
    .bind(userId)
    .run()

  // If they have an active Stripe subscription, cancel it so they stop being charged
  if (stripe) {
    const sub = await db
      .prepare('SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(userId)
      .first<{ stripe_customer_id: string | null }>()

    if (sub?.stripe_customer_id) {
      try {
        const activeSubs = await stripe.subscriptions.list({
          customer: sub.stripe_customer_id,
          status: 'active'
        })
        for (const s of activeSubs.data) {
          await stripe.subscriptions.cancel(s.id)
        }
        const trialSubs = await stripe.subscriptions.list({
          customer: sub.stripe_customer_id,
          status: 'trialing'
        })
        for (const s of trialSubs.data) {
          await stripe.subscriptions.cancel(s.id)
        }
      } catch {
        // No active subs to cancel, that's fine
      }
    }
  }

  // Invalidate license cache
  if (kv) await kv.delete(`license:${userId}`)
}

async function invalidateKVCache(
  db: D1Database,
  kv: KVNamespace | undefined,
  stripeCustomerId: string
): Promise<void> {
  if (!kv) return

  const sub = await db
    .prepare('SELECT user_id FROM subscriptions WHERE stripe_customer_id = ?')
    .bind(stripeCustomerId)
    .first<{ user_id: string }>()

  if (sub?.user_id) {
    await kv.delete(`license:${sub.user_id}`)
  }
}
