/**
 * Mock of the Stripe SDK for backend tests.
 *
 * All methods return configurable defaults. The event for
 * webhooks.constructEventAsync is configurable via setWebhookEvent().
 */
import { vi } from 'vitest'

export interface MockStripeOptions {
  /** Default customer ID returned by customers.create. Default: 'cus_test' */
  customerId?: string
  /** Default checkout URL. Default: 'https://checkout.stripe.com/test' */
  checkoutUrl?: string
  /** Default billing portal URL. Default: 'https://billing.stripe.com/test' */
  billingPortalUrl?: string
}

export function createMockStripe(opts: MockStripeOptions = {}) {
  const customerId = opts.customerId ?? 'cus_test'
  const checkoutUrl = opts.checkoutUrl ?? 'https://checkout.stripe.com/test'
  const billingPortalUrl = opts.billingPortalUrl ?? 'https://billing.stripe.com/test'

  let webhookEvent: any = {
    id: 'evt_test',
    type: 'customer.subscription.created',
    data: {
      object: {
        id: 'sub_test',
        customer: customerId,
        status: 'active',
      },
    },
  }

  const stripe = {
    customers: {
      create: vi.fn().mockResolvedValue({ id: customerId }),
    },

    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: checkoutUrl }),
      },
    },

    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: billingPortalUrl }),
      },
    },

    subscriptions: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      cancel: vi.fn().mockResolvedValue({}),
    },

    webhooks: {
      constructEventAsync: vi.fn().mockImplementation(async () => webhookEvent),
    },

    // ── Test helpers ──────────────────────────────────────────────

    /** Set the event object returned by webhooks.constructEventAsync. */
    setWebhookEvent(event: any): void {
      webhookEvent = event
      stripe.webhooks.constructEventAsync.mockImplementation(async () => webhookEvent)
    },

    /** Reset all mocks to their defaults. */
    reset(): void {
      stripe.customers.create.mockResolvedValue({ id: customerId })
      stripe.checkout.sessions.create.mockResolvedValue({ url: checkoutUrl })
      stripe.billingPortal.sessions.create.mockResolvedValue({ url: billingPortalUrl })
      stripe.subscriptions.list.mockResolvedValue({ data: [] })
      stripe.subscriptions.cancel.mockResolvedValue({})
      webhookEvent = {
        id: 'evt_test',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test',
            customer: customerId,
            status: 'active',
          },
        },
      }
      stripe.webhooks.constructEventAsync.mockImplementation(async () => webhookEvent)
    },
  }

  return stripe
}

export type MockStripe = ReturnType<typeof createMockStripe>
