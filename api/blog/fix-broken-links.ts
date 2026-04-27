import { createHmac } from 'crypto'
import { redis } from '../../lib/blog-store'
import type { BlogPostFull, BlogPostSummary } from '../../lib/blog-redis'

const COOKIE_NAME = 'sg_assistant_session'

// Known-bad → correct replacements. Add new entries here whenever a broken
// URL is identified, then re-run from the admin UI to clean every post.
const URL_REPLACEMENTS: Record<string, string> = {
  'https://www.riversidecountyassessor.org/': 'https://www.rivcoacr.org/',
  'https://www.riversidecountyassessor.org': 'https://www.rivcoacr.org',
  'https://www.rivcoclerk.org/': 'https://rivcocob.org/',
  'https://www.rivcoclerk.org': 'https://rivcocob.org',
}

// Legacy categories to collapse into the canonical 5-category taxonomy.
// market-update, investor-tips, seller-tips, community, trending-topics
const CATEGORY_REPLACEMENTS: Record<string, string> = {
  'local-happenings': 'community',
  'lifestyle': 'community',
  'community-spotlight': 'community',
  'local-area': 'community',
  'buying-tips': 'market-update',
  'selling-tips': 'seller-tips',
  'investment': 'investor-tips',
  'news': 'trending-topics',
  'market-insight': 'market-update',
}

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
  if ((!token || !verifyToken(token, secret)) && req.query?.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const slugs = new Set<string>()
    const idxRaw = await redis.get<string>('blog_posts_index')
    if (idxRaw) {
      const index: BlogPostSummary[] = typeof idxRaw === 'string' ? JSON.parse(idxRaw) : idxRaw
      index.forEach((p) => slugs.add(p.slug))
    }
    const qRaw = await redis.get<string>('blog_posts_queue')
    if (qRaw) {
      const queue: BlogPostSummary[] = typeof qRaw === 'string' ? JSON.parse(qRaw) : qRaw
      queue.forEach((p) => slugs.add(p.slug))
    }

    const results: Array<{ slug: string; urlChanges: number; categoryChanged: boolean }> = []

    for (const slug of slugs) {
      const raw = await redis.get<string>(`blog_post:${slug}`)
      if (!raw) continue

      const post: BlogPostFull = typeof raw === 'string' ? JSON.parse(raw) : raw
      let body = post.body || ''
      let urlChanges = 0
      let categoryChanged = false

      for (const [broken, correct] of Object.entries(URL_REPLACEMENTS)) {
        if (body.includes(broken)) {
          const before = body.split(broken).length - 1
          body = body.split(broken).join(correct)
          urlChanges += before
        }
      }

      const newCategory = CATEGORY_REPLACEMENTS[post.category]
      if (newCategory && newCategory !== post.category) {
        post.category = newCategory
        categoryChanged = true
      }

      if (urlChanges > 0 || categoryChanged) {
        post.body = body
        await redis.set(`blog_post:${slug}`, JSON.stringify(post))
        results.push({ slug, urlChanges, categoryChanged })
      }
    }

    // Also migrate categories in summary indexes (queue + public index)
    let summaryUpdates = 0
    for (const key of ['blog_posts_index', 'blog_posts_queue']) {
      const raw = await redis.get<string>(key)
      if (!raw) continue
      const list: BlogPostSummary[] = typeof raw === 'string' ? JSON.parse(raw) : raw
      let touched = false
      for (const item of list) {
        const newCat = CATEGORY_REPLACEMENTS[item.category]
        if (newCat && newCat !== item.category) {
          item.category = newCat
          touched = true
          summaryUpdates++
        }
      }
      if (touched) await redis.set(key, JSON.stringify(list))
    }

    return res.status(200).json({ ok: true, postsUpdated: results.length, summaryUpdates, results })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
