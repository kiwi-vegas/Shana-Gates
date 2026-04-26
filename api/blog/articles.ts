import { getDailyArticles, getLatestDailyArticles, getEventArticles } from '../../lib/blog-store'
import type { ScoredArticle } from '../../lib/blog-store'

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {}
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=')
      return [k.trim(), v.join('=')]
    })
  )
}

function toYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const adminSecret = process.env.ADMIN_SECRET
  if (adminSecret && req.query?.secret !== adminSecret) {
    const cookies = parseCookies(req.headers.cookie)
    if (!cookies['sg_assistant_session']) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  try {
    let articles: ScoredArticle[]
    let date: string

    if (req.query?.date) {
      articles = await getDailyArticles(req.query.date as string)
      date = req.query.date as string
    } else {
      const latest = await getLatestDailyArticles()
      articles = latest.articles
      date = latest.date
    }

    // Merge in event articles: always check current month; check next month in last week
    const now = new Date()
    const currentYM = toYearMonth(now.getFullYear(), now.getMonth() + 1)

    let nextYM: string | null = null
    if (now.getDate() >= 24) {
      let nm = now.getMonth() + 2
      let ny = now.getFullYear()
      if (nm > 12) { nm = 1; ny++ }
      nextYM = toYearMonth(ny, nm)
    }

    const [currentEvents, nextEvents] = await Promise.all([
      getEventArticles(currentYM),
      nextYM ? getEventArticles(nextYM) : Promise.resolve([]),
    ])

    // Next month events go first (most timely for scheduling), then current month, then daily
    const eventArticles = [...(nextEvents ?? []), ...(currentEvents ?? [])]
    if (eventArticles.length > 0) {
      const existingIds = new Set(articles.map((a) => a.id))
      const newEvents = eventArticles.filter((a) => !existingIds.has(a.id))
      if (newEvents.length > 0) {
        articles = [...newEvents, ...articles]
      }
    }

    return res.status(200).json({ articles, date })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
