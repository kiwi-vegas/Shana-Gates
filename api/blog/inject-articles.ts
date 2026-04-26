import { createHmac } from 'crypto'
import { getDailyArticles, storeDailyArticles } from '../../lib/blog-store'
import type { ScoredArticle } from '../../lib/blog-store'

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

  const { articles } = req.body ?? {}
  if (!Array.isArray(articles) || articles.length === 0) {
    return res.status(400).json({ error: 'articles[] required' })
  }

  const today = new Date().toISOString().split('T')[0]

  // Load existing articles for today and prepend new ones (new articles appear first)
  const existing = await getDailyArticles(today)
  const existingUrls = new Set(existing.map((a) => a.url))
  const deduped = (articles as ScoredArticle[]).filter((a) => !existingUrls.has(a.url))
  const merged = [...deduped, ...existing]

  await storeDailyArticles(today, merged)

  return res.status(200).json({ ok: true, date: today, count: merged.length, added: deduped.length })
}
