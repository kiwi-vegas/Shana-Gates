/**
 * GET /api/community?slug=palm-springs
 * Returns community page override data (stats, images, headlines) from Redis.
 * Replaces the direct Sanity CDN browser fetch on all 9 community pages.
 * Returns {} when no override exists — community pages fall back to hardcoded HTML.
 */

import { getCommunityOverride } from '../lib/blog-redis'

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const slug = req.query?.slug as string | undefined
  if (!slug) return res.status(400).json({ error: 'slug required' })

  try {
    const data = await getCommunityOverride(slug)
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
    return res.status(200).json(data ?? {})
  } catch (err) {
    console.error('[community] error:', err)
    return res.status(500).json({})
  }
}
