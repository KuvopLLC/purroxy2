const RESEND_API = 'https://api.resend.com/emails'
const FROM_EMAIL = 'Purroxy <noreply@purroxy.com>'

interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

async function sendEmail(apiKey: string, options: SendEmailOptions): Promise<boolean> {
  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: options.to,
        subject: options.subject,
        html: options.html
      })
    })
    return res.ok
  } catch {
    console.error('[email] Failed to send email')
    return false
  }
}

export async function sendVerificationEmail(
  apiKey: string,
  to: string,
  token: string,
  appUrl: string
): Promise<boolean> {
  const verifyUrl = `${appUrl}/api/auth/verify-email?token=${token}`
  return sendEmail(apiKey, {
    to,
    subject: 'Verify your Purroxy account',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="margin: 0 0 16px;">Welcome to Purroxy</h2>
        <p style="color: #555; line-height: 1.5;">Click the button below to verify your email address. This link expires in 24 hours.</p>
        <a href="${verifyUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">Verify Email</a>
        <p style="color: #999; font-size: 13px;">If you didn't create this account, you can ignore this email.</p>
      </div>
    `
  })
}

export async function sendPasswordResetEmail(
  apiKey: string,
  to: string,
  token: string,
  appUrl: string
): Promise<boolean> {
  const resetUrl = `${appUrl}/reset-password?token=${token}`
  return sendEmail(apiKey, {
    to,
    subject: 'Reset your Purroxy password',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="margin: 0 0 16px;">Password Reset</h2>
        <p style="color: #555; line-height: 1.5;">Click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">Reset Password</a>
        <p style="color: #999; font-size: 13px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `
  })
}

export async function sendSubmissionApprovedEmail(
  apiKey: string,
  to: string,
  capabilityName: string
): Promise<boolean> {
  return sendEmail(apiKey, {
    to,
    subject: 'Your capability was approved!',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="margin: 0 0 16px;">Capability Approved</h2>
        <p style="color: #555; line-height: 1.5;"><strong>${capabilityName}</strong> is now live in the community library.</p>
        <p style="color: #555; line-height: 1.5;">As a thank you for contributing, you now have <strong>free Purroxy access forever</strong>.</p>
        <p style="color: #999; font-size: 13px;">Thank you for making Purroxy better for everyone.</p>
      </div>
    `
  })
}

export async function sendSubmissionRejectedEmail(
  apiKey: string,
  to: string,
  capabilityName: string,
  reason: string
): Promise<boolean> {
  return sendEmail(apiKey, {
    to,
    subject: 'Changes needed for your capability',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="margin: 0 0 16px;">Changes Needed</h2>
        <p style="color: #555; line-height: 1.5;">Your submission <strong>${capabilityName}</strong> needs some changes before it can be published:</p>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="color: #333; margin: 0; line-height: 1.5;">${reason}</p>
        </div>
        <p style="color: #555; line-height: 1.5;">You can update and resubmit from the Community tab in the app.</p>
      </div>
    `
  })
}
