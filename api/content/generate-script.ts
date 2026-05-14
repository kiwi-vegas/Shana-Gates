import { createHmac } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'

const COOKIE_NAME = 'sg_assistant_session'

function parseCookies(h: string | undefined): Record<string, string> {
  if (!h) return {}
  return Object.fromEntries(h.split(';').map(c => { const [k, ...v] = c.trim().split('='); return [k.trim(), v.join('=')] }))
}
function verifyToken(token: string, secret: string): boolean {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return false
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  return createHmac('sha256', secret).update(payload).digest('hex') === sig
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.ADMIN_SECRET
  if (!secret) return res.status(500).json({ error: 'Not configured' })

  const cookies = parseCookies(req.headers.cookie)
  const token = cookies[COOKIE_NAME]
  if (!token || !verifyToken(token, secret)) return res.status(401).json({ error: 'Unauthorized' })

  const { title, excerpt, category } = req.body ?? {}
  if (!title) return res.status(400).json({ error: 'title required' })

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const prompt = `You are writing a video script for Shana Gates, a licensed REALTOR® and agent at Craft & Bauer | Real Broker in the Coachella Valley, California.

Shana will record a short video (45–90 seconds) to post on social media alongside a blog article. The script should feel natural and conversational — like Shana is talking directly to a neighbor or client in the desert, not reading a press release.

ARTICLE TITLE: ${title}
EXCERPT: ${excerpt ?? 'No excerpt provided.'}
CATEGORY: ${category ?? 'general'}

Write a video script Shana can read straight from this page. Structure:

[HOOK — 1 sentence that grabs attention and speaks directly to a Coachella Valley buyer, seller, or homeowner]

[2–3 TALKING POINTS — what people in the Coachella Valley specifically need to know about this topic. Each point is 1–2 sentences. Shana speaks from her experience as a local desert market expert.]

[LOCAL IMPACT — Shana gives her honest take as a licensed agent: does this topic have a POSITIVE, NEGATIVE, or NEUTRAL effect on homeowners or buyers in the CV? One clear sentence with her verdict, then 1–2 sentences on why.]

[CALL TO ACTION — 1 sentence inviting viewers to reach out, read the full article, or search listings. Genuine, not salesy.]

Rules:
- Write in first person as Shana ("I", "my clients", "we")
- Do NOT use bullet points or numbered lists — write as flowing spoken sentences
- Do NOT include section labels like [HOOK] in the final script — write it as one continuous script
- Match the content length to the topic — simple topics can be 40–50 seconds (~100 words), complex ones up to 90 seconds (~200 words)
- Shana's tone: warm, knowledgeable, direct — a trusted neighbor who knows the desert market cold
- Mention the Coachella Valley naturally at least once

Return ONLY the script text. No intro, no explanation, no markdown.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })
    const script = (message.content[0] as { type: string; text: string }).text.trim()
    return res.status(200).json({ script })
  } catch (err: any) {
    console.error('[generate-script]', err)
    return res.status(500).json({ error: 'Failed to generate script' })
  }
}
