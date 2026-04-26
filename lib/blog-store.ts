import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// ── Types ──────────────────────────────────────────────────────────────────

export interface ScoredArticle {
  id: string
  url: string
  title: string
  source: string
  publishedDate: string
  summary: string
  score: number
  category: string
  whyItMatters: string
}

export interface WeeklyTopic {
  id: string
  category: string
  title: string
  angle: string
  researchContext: string
  keywords: string[]
}

// ── Daily articles ─────────────────────────────────────────────────────────

export async function storeDailyArticles(date: string, articles: ScoredArticle[]): Promise<void> {
  const key = `daily_articles:${date}`
  await redis.set(key, JSON.stringify(articles), { ex: 60 * 60 * 48 }) // 48hr TTL
}

export async function getDailyArticles(date: string): Promise<ScoredArticle[]> {
  const key = `daily_articles:${date}`
  const raw = await redis.get<string>(key)
  if (!raw) return []
  return typeof raw === 'string' ? JSON.parse(raw) : (raw as ScoredArticle[])
}

export async function getLatestDailyArticles(): Promise<{ date: string; articles: ScoredArticle[] }> {
  // Try last 3 days
  for (let i = 0; i < 3; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const date = d.toISOString().split('T')[0]
    const articles = await getDailyArticles(date)
    if (articles.length > 0) return { date, articles }
  }
  return { date: new Date().toISOString().split('T')[0], articles: [] }
}

// ── Shown-article tracking (skip repeats) ─────────────────────────────────

export async function incrementShownCount(articleId: string): Promise<number> {
  const key = `article_shown_counts:${articleId}`
  const count = await redis.incr(key)
  await redis.expire(key, 60 * 60 * 24 * 30) // 30-day memory
  return count
}

export async function getShownCount(articleId: string): Promise<number> {
  const key = `article_shown_counts:${articleId}`
  const count = await redis.get<number>(key)
  return count ?? 0
}

// ── Monthly event articles ─────────────────────────────────────────────────
// Key: event_articles:{YYYY-MM}  TTL: 20 days (covers the pre-month research window + full month)

export async function storeEventArticles(yearMonth: string, articles: ScoredArticle[]): Promise<void> {
  const key = `event_articles:${yearMonth}`
  await redis.set(key, JSON.stringify(articles), { ex: 60 * 60 * 24 * 20 })
}

export async function getEventArticles(yearMonth: string): Promise<ScoredArticle[]> {
  const key = `event_articles:${yearMonth}`
  const raw = await redis.get<string>(key)
  if (!raw) return []
  return typeof raw === 'string' ? JSON.parse(raw) : (raw as ScoredArticle[])
}

// ── Weekly topics ──────────────────────────────────────────────────────────

export async function storeWeeklyTopics(topics: WeeklyTopic[]): Promise<void> {
  const key = `weekly_topics:latest`
  await redis.set(key, JSON.stringify(topics), { ex: 60 * 60 * 72 }) // 72hr TTL
}

export async function getWeeklyTopics(): Promise<WeeklyTopic[]> {
  const key = `weekly_topics:latest`
  const raw = await redis.get<string>(key)
  if (!raw) return []
  return typeof raw === 'string' ? JSON.parse(raw) : (raw as WeeklyTopic[])
}
