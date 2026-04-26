import { createHmac } from 'crypto'
import { redis } from '../../lib/blog-store'
import { autoLinkEntities } from '../../lib/blog-entity-links'
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
  const querySecret = req.query?.secret
  if ((!token || !verifyToken(token, secret)) && querySecret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const limit = Math.min(parseInt(req.body?.limit ?? req.query?.limit ?? '6', 10) || 6, 20)

  try {
    // Get recent published posts
    const idxRaw = await redis.get<string>('blog_posts_index')
    if (!idxRaw) return res.status(200).json({ ok: true, processed: 0 })

    const index: BlogPostSummary[] = typeof idxRaw === 'string' ? JSON.parse(idxRaw) : idxRaw
    const toProcess = index.slice(0, limit)

    const results: Array<{ slug: string; status: string; entitiesFound: number }> = []

    for (const summary of toProcess) {
      try {
        const raw = await redis.get<string>(`blog_post:${summary.slug}`)
        if (!raw) { results.push({ slug: summary.slug, status: 'not_found', entitiesFound: 0 }); continue }

        const post: BlogPostFull = typeof raw === 'string' ? JSON.parse(raw) : raw
        const originalBody = post.body || ''
        const enrichedBody = await autoLinkEntities(originalBody)

        // Count how many new markdown links were added
        const originalLinks = (originalBody.match(/\]\(https?:\/\//g) || []).length
        const newLinks = (enrichedBody.match(/\]\(https?:\/\//g) || []).length
        const added = newLinks - originalLinks

        if (added > 0) {
          post.body = enrichedBody
          await redis.set(`blog_post:${summary.slug}`, JSON.stringify(post))
        }

        results.push({ slug: summary.slug, status: added > 0 ? 'enriched' : 'unchanged', entitiesFound: added })
      } catch (err) {
        results.push({ slug: summary.slug, status: `error: ${err instanceof Error ? err.message : 'unknown'}`, entitiesFound: 0 })
      }
    }

    return res.status(200).json({ ok: true, processed: results.length, results })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
