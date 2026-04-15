/**
 * POST /api/blog/run-research?type=weekly|daily
 * Manually triggers research pipelines from the admin UI.
 * Auth: same sg_assistant_session cookie as the other admin endpoints.
 */
import { createHmac } from 'crypto'

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

  const type = (req.query?.type ?? 'weekly') as string

  if (type === 'weekly') {
    const { runWeeklyResearch } = await import('../../lib/weekly-research')
    const { storeWeeklyTopics } = await import('../../lib/blog-store')

    try {
      const topics = await runWeeklyResearch()
      if (topics.length === 0) {
        return res.status(200).json({ ok: true, count: 0, topics: [] })
      }
      await storeWeeklyTopics(topics)
      return res.status(200).json({ ok: true, count: topics.length, topics })
    } catch (err) {
      console.error('[run-research] weekly error:', err)
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Research failed' })
    }
  }

  if (type === 'daily') {
    const { runDailyResearch } = await import('../../lib/research')
    const { storeDailyArticles } = await import('../../lib/blog-store')

    try {
      const { date, articles } = await runDailyResearch()
      if (articles.length === 0) {
        return res.status(200).json({ ok: true, count: 0, articles: [] })
      }
      await storeDailyArticles(date, articles)
      return res.status(200).json({ ok: true, count: articles.length, date })
    } catch (err) {
      console.error('[run-research] daily error:', err)
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Research failed' })
    }
  }

  return res.status(400).json({ error: 'type must be weekly or daily' })
}
