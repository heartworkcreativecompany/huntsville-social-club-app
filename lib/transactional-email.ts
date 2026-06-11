'use server'

import { appOrigin, SUPPORT_EMAIL } from '@/lib/site'

type EmailPayload = {
  to: string
  subject: string
  html: string
  text: string
}

async function sendEmail(payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY
  const from =
    process.env.EMAIL_FROM ??
    'Huntsville Social Club <onboarding@resend.dev>'

  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[email skipped — set RESEND_API_KEY]', {
        to: payload.to,
        subject: payload.subject,
      })
    }
    return { skipped: true as const }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    console.error('[email failed]', detail)
    return { error: 'Email delivery failed.' as const }
  }

  return { sent: true as const }
}

function emailShell(title: string, body: string, cta?: { label: string; href: string }) {
  const origin = appOrigin()
  const ctaBlock = cta
    ? `<p style="margin:24px 0;"><a href="${cta.href}" style="background:#1a1a1a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">${cta.label}</a></p>`
    : ''

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;line-height:1.5;">
      <p style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#666;">Huntsville Social Club</p>
      <h1 style="font-size:22px;font-weight:500;margin:8px 0 16px;">${title}</h1>
      ${body}
      ${ctaBlock}
      <p style="margin-top:32px;font-size:13px;color:#666;">Questions? Reply to ${SUPPORT_EMAIL}</p>
      <p style="font-size:12px;color:#999;">${origin}</p>
    </div>
  `

  const text = `${title}\n\n${body.replace(/<[^>]+>/g, '')}${cta ? `\n\n${cta.label}: ${cta.href}` : ''}\n\nQuestions: ${SUPPORT_EMAIL}`

  return { html, text }
}

export async function sendWelcomeEmail(to: string) {
  const origin = appOrigin()
  const { html, text } = emailShell(
    'Welcome to Huntsville Social Club',
    `<p>Thanks for creating your account. Confirm your email using the link Supabase sent, then sign in to start your membership application.</p>
     <p>We review every application thoughtfully — save progress anytime and submit when you are ready.</p>`,
    { label: 'Sign in', href: `${origin}/login` }
  )

  return sendEmail({
    to,
    subject: 'Welcome — confirm your email',
    html,
    text,
  })
}

export async function sendApplicationSubmittedEmail(to: string) {
  const origin = appOrigin()
  const { html, text } = emailShell(
    'Application received',
    `<p>Your membership application has been submitted. Our team will review it and update your status in the app.</p>
     <p>You can track progress anytime on your application status page.</p>`,
    { label: 'View application status', href: `${origin}/application/status` }
  )

  return sendEmail({ to, subject: 'Application submitted', html, text })
}

export async function sendApplicationApprovedEmail(to: string) {
  const origin = appOrigin()
  const { html, text } = emailShell(
    'Membership approved',
    `<p>Welcome to the club. Your membership is active — browse events, connect with verified members, and keep your profile current.</p>`,
    { label: 'Go to member home', href: `${origin}/home` }
  )

  return sendEmail({ to, subject: 'Membership approved', html, text })
}

export async function sendApplicationRejectedEmail(
  to: string,
  notes?: string | null
) {
  const origin = appOrigin()
  const noteBlock = notes?.trim()
    ? `<p><strong>Reviewer note:</strong> ${notes.trim()}</p>`
    : ''

  const { html, text } = emailShell(
    'Application update',
    `<p>Your membership application was not approved at this time.</p>
     ${noteBlock}
     <p>If you have questions, reach out to our team.</p>`,
    { label: 'View application', href: `${origin}/application/status` }
  )

  return sendEmail({ to, subject: 'Application update', html, text })
}

export async function sendApplicationNeedsInfoEmail(
  to: string,
  notes?: string | null
) {
  const origin = appOrigin()
  const noteBlock = notes?.trim()
    ? `<p><strong>What we need:</strong> ${notes.trim()}</p>`
    : '<p>Please review your application and provide the requested updates.</p>'

  const { html, text } = emailShell(
    'More information needed',
    `<p>We reviewed your application and need a few updates before we can continue.</p>
     ${noteBlock}`,
    { label: 'Update application', href: `${origin}/application` }
  )

  return sendEmail({
    to,
    subject: 'Application — more information needed',
    html,
    text,
  })
}
