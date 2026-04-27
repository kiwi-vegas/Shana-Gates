import { createHmac } from 'crypto'
import { autoLinkEntities } from '../../lib/blog-entity-links'
import { publishBlogPost } from '../../lib/blog-redis'
import type { BlogPostOutput } from '../../lib/writer'

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

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) + `-${Date.now()}`
  )
}

function extractExcerpt(body: string, maxLen = 200): string {
  const lines = body.split('\n').filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('*') && !l.startsWith('-'))
  return (lines[0] ?? '').replace(/\*\*/g, '').slice(0, maxLen).trim()
}

const VALID_CATEGORIES = ['market-update', 'investor-tips', 'seller-tips', 'community', 'trending-topics']
const CATEGORY_ALIASES: Record<string, string> = {
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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.ADMIN_SECRET
  if (!secret) return res.status(500).json({ error: 'Not configured' })

  const cookies = parseCookies(req.headers.cookie)
  const token = cookies[COOKIE_NAME]
  if (!token || !verifyToken(token, secret)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { title, body, category, city, excerpt, sourceUrl, sourceTitle, autoLink = true } = req.body ?? {}

  if (!title?.trim() || !body?.trim() || !category?.trim()) {
    return res.status(400).json({ error: 'title, body, and category are required' })
  }
  const normalizedCategory = CATEGORY_ALIASES[category] || category
  if (!VALID_CATEGORIES.includes(normalizedCategory)) {
    return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` })
  }

  try {
    const finalBody = autoLink
      ? await autoLinkEntities(body).catch(() => body)
      : body

    const post: BlogPostOutput = {
      title: title.trim(),
      slug: slugify(title),
      excerpt: (excerpt?.trim() || extractExcerpt(finalBody)),
      body: finalBody,
      category: normalizedCategory,
      sourceUrl: sourceUrl?.trim() || '',
      sourceTitle: sourceTitle?.trim() || '',
      pipeline: 'daily',
      city: city?.trim() || undefined,
    }

    const result = await publishBlogPost(post, { imageUrl: null })

    return res.status(200).json({ ok: true, slug: result.slug, _id: result._id })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
