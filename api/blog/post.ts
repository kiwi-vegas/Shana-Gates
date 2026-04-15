/**
 * GET /api/blog/post?slug=...
 * Public endpoint — returns a single blog post by slug.
 * Proxies Sanity reads server-side to avoid browser CORS restrictions.
 */
import { getPostBySlug } from '../../lib/blog-sanity'

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const slug = req.query?.slug as string | undefined
  if (!slug) return res.status(400).json({ error: 'slug required' })

  try {
    const post = await getPostBySlug(slug)
    if (!post) return res.status(404).json({ error: 'Post not found' })

    // Cache individual posts for 5 minutes — content doesn't change
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return res.status(200).json({ post })
  } catch (err) {
    console.error('[post] error:', err)
    return res.status(500).json({ error: 'Failed to load post' })
  }
}
