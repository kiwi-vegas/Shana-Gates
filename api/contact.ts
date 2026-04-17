/**
 * POST /api/contact
 *
 * Handles contact form submissions. Sends two emails via Resend:
 *  1. Notification to Shana with all form details + reply-to set to the visitor
 *  2. Auto-reply confirmation to the visitor
 *
 * Required env vars: RESEND_API_KEY, FROM_EMAIL
 */

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const TO_EMAIL = 'shana@craftbauer.com'
const FROM_EMAIL = process.env.FROM_EMAIL || 'website@shanasells.com'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { name, email, phone, message } = req.body ?? {}

  // Basic validation
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'Name, email, and message are required.' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' })
  }
  if (message.trim().length > 2000) {
    return res.status(400).json({ error: 'Message must be under 2,000 characters.' })
  }

  const safeName    = escapeHtml(name.trim())
  const safeEmail   = escapeHtml(email.trim())
  const safePhone   = phone?.trim() ? escapeHtml(phone.trim()) : null
  const safeMessage = escapeHtml(message.trim()).replace(/\n/g, '<br>')
  const firstName   = safeName.split(' ')[0]

  try {
    // 1 — Notify Shana
    await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      replyTo: email.trim(),
      subject: `New contact from ${safeName} — shanasells.com`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1814">
          <div style="background:#1a1e3c;padding:24px 32px;border-radius:6px 6px 0 0">
            <p style="color:#B8975A;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin:0">New Contact Form Submission</p>
            <h1 style="color:#F2EDE4;font-size:22px;font-weight:600;margin:8px 0 0">shanasells.com</h1>
          </div>
          <div style="background:#fff;padding:32px;border:1px solid #e8e1d5;border-top:none;border-radius:0 0 6px 6px">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:10px 0;border-bottom:1px solid #f0ebe3;font-weight:600;width:100px">Name</td><td style="padding:10px 0;border-bottom:1px solid #f0ebe3">${safeName}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f0ebe3;font-weight:600">Email</td><td style="padding:10px 0;border-bottom:1px solid #f0ebe3"><a href="mailto:${safeEmail}" style="color:#4864c8">${safeEmail}</a></td></tr>
              ${safePhone ? `<tr><td style="padding:10px 0;border-bottom:1px solid #f0ebe3;font-weight:600">Phone</td><td style="padding:10px 0;border-bottom:1px solid #f0ebe3"><a href="tel:${safePhone}" style="color:#4864c8">${safePhone}</a></td></tr>` : ''}
            </table>
            <h3 style="margin:24px 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:0.1em;color:#888">Message</h3>
            <p style="line-height:1.7;color:#3a3530">${safeMessage}</p>
            <div style="margin-top:32px;padding:16px;background:#f8f5f0;border-radius:4px">
              <a href="mailto:${safeEmail}" style="display:inline-block;background:#B8975A;color:#fff;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:600;font-size:14px">Reply to ${firstName}</a>
            </div>
          </div>
          <p style="color:#aaa;font-size:11px;text-align:center;margin-top:16px">Sent from the contact form on shanasells.com</p>
        </div>
      `,
    })

    // 2 — Auto-reply to visitor
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email.trim(),
      subject: `Thanks for reaching out, ${firstName}!`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1814">
          <div style="background:#1a1e3c;padding:24px 32px;border-radius:6px 6px 0 0">
            <p style="color:#B8975A;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin:0">Shana Gates</p>
            <h1 style="color:#F2EDE4;font-size:22px;font-weight:600;margin:8px 0 0">Craft &amp; Bauer | Real Broker</h1>
          </div>
          <div style="background:#fff;padding:32px;border:1px solid #e8e1d5;border-top:none;border-radius:0 0 6px 6px">
            <p style="font-size:16px;margin-bottom:16px">Hi ${firstName},</p>
            <p style="line-height:1.7;color:#3a3530;margin-bottom:16px">Thanks for reaching out! I've received your message and will be in touch shortly. I'm committed to responding within one business day.</p>
            <p style="line-height:1.7;color:#3a3530;margin-bottom:24px">In the meantime, feel free to call or text me directly at <a href="tel:7602324054" style="color:#4864c8;font-weight:600">(760) 232-4054</a>.</p>
            <p style="color:#3a3530">— Shana Gates<br><span style="color:#888;font-size:13px">REALTOR® · Craft &amp; Bauer | Real Broker<br>74-710 CA-111 #102, Palm Desert, CA 92260</span></p>
          </div>
        </div>
      `,
    })

    return res.status(200).json({ success: true })
  } catch (err: any) {
    console.error('Contact form error:', err)
    return res.status(500).json({ error: 'Failed to send message. Please try calling or emailing directly.' })
  }
}
