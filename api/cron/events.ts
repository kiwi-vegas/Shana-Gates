import { runEventsResearch } from '../../lib/events-research'
import { storeEventArticles } from '../../lib/blog-store'

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.authorization
    const bodySecret = req.body?.secret ?? req.query?.secret
    if (authHeader !== `Bearer ${cronSecret}` && bodySecret !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  try {
    const now = new Date()
    let month = now.getMonth() + 2 // +1 for 0-index, +1 for next month
    let year = now.getFullYear()
    if (month > 12) { month = 1; year++ }

    const articles = await runEventsResearch(month, year)
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`
    await storeEventArticles(yearMonth, articles)

    return res.status(200).json({ ok: true, month: yearMonth, count: articles.length })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Events research failed' })
  }
}
