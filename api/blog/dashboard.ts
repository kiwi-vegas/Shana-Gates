/**
 * api/blog/dashboard.ts
 * Blog effectiveness dashboard data endpoint.
 * Auth: HMAC cookie (same session as the assistant).
 *
 * GET /api/blog/dashboard  → returns blog stats + post list
 */

import { createHmac } from 'crypto'
import { redis } from '../../lib/blog-store'
import type { BlogPostSummary } from '../../lib/blog-redis'

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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.ADMIN_SECRET
  if (!secret) return res.status(500).json({ error: 'Not configured' })

  const cookies = parseCookies(req.headers.cookie)
  const token = cookies[COOKIE_NAME]
  if (!token || !verifyToken(token, secret)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const raw = await redis.get<string>('blog_posts_index')
  const allPosts: BlogPostSummary[] = raw
    ? (typeof raw === 'string' ? JSON.parse(raw) : raw)
    : []

  // Last 90 days
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)
  const recent = allPosts.filter((p) => new Date(p.publishedAt) >= cutoff)

  // Posts per week (over last 90 days = 12.86 weeks)
  const postsPerWeek = recent.length > 0 ? (recent.length / 12.86).toFixed(1) : '0.0'

  // Category breakdown
  const byCat: Record<string, number> = {}
  recent.forEach((p) => { byCat[p.category] = (byCat[p.category] || 0) + 1 })

  // Pipeline breakdown
  const byPipeline: Record<string, number> = {}
  allPosts.forEach((p) => { byPipeline[p.pipeline || 'unknown'] = (byPipeline[p.pipeline || 'unknown'] || 0) + 1 })

  // Per-post list with age in days
  const now = Date.now()
  const posts = recent.map((p) => ({
    slug: p.slug,
    title: p.title,
    category: p.category,
    pipeline: p.pipeline,
    city: p.city || null,
    publishedAt: p.publishedAt,
    ageDays: Math.floor((now - new Date(p.publishedAt).getTime()) / 86400000),
    hasImage: !!p.heroImageUrl,
  }))

  res.setHeader('Cache-Control', 'private, no-store')
  return res.status(200).json({
    totalPosts: allPosts.length,
    recentPosts: recent.length,
    postsPerWeek,
    byCat,
    byPipeline,
    gaMeasurementId: process.env.GA_MEASUREMENT_ID || 'G-X2N2M3LDKS',
    gaPropertyId: process.env.GOOGLE_ANALYTICS_PROPERTY_ID || null,
    gaConnected: !!process.env.GOOGLE_ANALYTICS_PROPERTY_ID,
    posts,
    generatedAt: new Date().toISOString(),
  })
}
