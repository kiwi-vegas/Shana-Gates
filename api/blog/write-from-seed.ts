/**
 * api/blog/write-from-seed.ts
 *
 * Writes a blog post directly from a history seed and adds it to the VA queue.
 * Use this when a specific curated story needs to be (re-)written with its
 * exact original title without going through the blog picker.
 *
 * Usage: POST /api/blog/write-from-seed
 * Body: { slug: "sinatra-twin-palms-estate", secret: "ADMIN_SECRET" }
 *   or: GET  /api/blog/write-from-seed?slug=sinatra-twin-palms-estate&secret=...
 */

import { PALM_SPRINGS_STORIES } from '../../lib/history-seeds'
import { writeFromArticle } from '../../lib/writer'
import { publishBlogPost } from '../../lib/blog-redis'
import { generateHeroImage } from '../../lib/blog-images'
import type { ScoredArticle } from '../../lib/blog-store'

export const config = { maxDuration: 120 }

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.ADMIN_SECRET
  const provided = req.query?.secret ?? req.body?.secret
  if (secret && provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const slug = req.query?.slug ?? req.body?.slug
  if (!slug) {
    const slugList = PALM_SPRINGS_STORIES.map((s) => s.slug)
    return res.status(400).json({ error: 'slug required', available: slugList })
  }

  const story = PALM_SPRINGS_STORIES.find((s) => s.slug === slug)
  if (!story) {
    return res.status(404).json({ error: `Seed not found: ${slug}` })
  }

  const article: ScoredArticle = {
    id: `history-${story.slug}`,
    url: '',
    title: story.title,
    source: 'Palm Springs History',
    publishedDate: '',
    summary: `${story.angle}\n\n${story.researchData}`,
    score: 9,
    category: 'local-history',
    whyItMatters: story.whyItMatters,
  }

  try {
    const post = await writeFromArticle(article)
    const heroImage = await generateHeroImage(
      post.title, story.whyItMatters, post.category, '', post.body
    ).catch(() => ({ imageUrl: null }))
    const result = await publishBlogPost(post, heroImage)
    return res.status(200).json({ ok: true, slug: result.slug, title: story.title })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
