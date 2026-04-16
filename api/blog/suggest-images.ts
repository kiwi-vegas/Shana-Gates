import { createHmac } from 'crypto'
import { getSuggestionsForItems } from '../../lib/blog-inline-images'

const COOKIE_NAME = 'sg_assistant_session'

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {}
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=')
      return [k.trim(), v.join('=')]
    })
  )
}

function verifyToken(token: string, secret: string): boolean {
  const lastDot = token.lastIndexOf('.')
  if (lastDot === -1) return false
  const payload = token.slice(0, lastDot)
  const sig = token.slice(lastDot + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  return sig === expected
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.ADMIN_SECRET
  if (!secret) return res.status(500).json({ error: 'Not configured' })

  const cookies = parseCookies(req.headers.cookie)
  const token = cookies[COOKIE_NAME]
  if (!token || !verifyToken(token, secret)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { items } = req.body ?? {}

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items[] required' })
  }

  // Normalize items — handle both daily article fields and weekly topic fields
  const normalized = items.map((item: any) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    contentContext: [item.summary, item.whyItMatters, item.angle, item.researchContext]
      .filter(Boolean)
      .join('\n\n'),
  }))

  try {
    const suggestions = await getSuggestionsForItems(normalized)
    return res.status(200).json({ suggestions })
  } catch (err) {
    console.error('[suggest-images] Error:', err)
    return res.status(500).json({ error: 'Image suggestion failed. Try publishing without photos.' })
  }
}
