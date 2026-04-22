/**
 * GET /api/blog/posts?limit=24
 * Public endpoint — returns published blog posts for the blog listing page.
 * Proxies Sanity reads server-side to avoid browser CORS restrictions.
 */
import { getPublishedPosts } from '../../lib/blog-redis'

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const limit = Math.min(parseInt(req.query?.limit ?? '48', 10) || 48, 100)
    const city = req.query?.city as string | undefined
    let posts = await getPublishedPosts(limit)
    if (city) posts = posts.filter((p) => p.city === city)
    // Allow CDN/browser caching for 60 seconds — fresh enough for a blog
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
    return res.status(200).json({ posts })
  } catch (err) {
    console.error('[posts] error:', err)
    return res.status(500).json({ error: 'Failed to load posts' })
  }
}
