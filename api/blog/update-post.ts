import { createHmac } from 'crypto'
import { redis } from '../../lib/blog-store'
import type { BlogPostFull, BlogPostSummary } from '../../lib/blog-redis'

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

  const { slug, category, title } = req.body ?? {}
  if (!slug) return res.status(400).json({ error: 'slug required' })

  try {
    // Update full post record
    const raw = await redis.get<string>(`blog_post:${slug}`)
    if (!raw) return res.status(404).json({ error: 'Post not found' })

    const post: BlogPostFull = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (category) post.category = category
    if (title?.trim()) post.title = title.trim()
    await redis.set(`blog_post:${slug}`, JSON.stringify(post))

    // Update in blog_posts_index if present
    const idxRaw = await redis.get<string>('blog_posts_index')
    if (idxRaw) {
      const index: BlogPostSummary[] = typeof idxRaw === 'string' ? JSON.parse(idxRaw) : idxRaw
      const idx = index.findIndex((p) => p.slug === slug)
      if (idx >= 0) {
        if (category) index[idx].category = category
        if (title?.trim()) index[idx].title = title.trim()
        await redis.set('blog_posts_index', JSON.stringify(index))
      }
    }

    // Update in queue if present
    const qRaw = await redis.get<string>('blog_posts_queue')
    if (qRaw) {
      const queue: BlogPostSummary[] = typeof qRaw === 'string' ? JSON.parse(qRaw) : qRaw
      const qi = queue.findIndex((p) => p.slug === slug)
      if (qi >= 0) {
        if (category) queue[qi].category = category
        if (title?.trim()) queue[qi].title = title.trim()
        await redis.set('blog_posts_queue', JSON.stringify(queue))
      }
    }

    return res.status(200).json({ ok: true, slug, category: post.category, title: post.title })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
