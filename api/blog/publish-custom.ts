import { createHmac } from 'crypto'
import { writeFromArticle } from '../../lib/writer'
import { generateHeroImage } from '../../lib/blog-images'
import { publishBlogPost } from '../../lib/blog-redis'
import type { ScoredArticle } from '../../lib/blog-store'

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

  const { articles } = req.body ?? {}
  if (!Array.isArray(articles) || articles.length === 0) {
    return res.status(400).json({ error: 'articles[] required' })
  }

  if (articles.length > 5) {
    return res.status(400).json({ error: 'Maximum 5 articles per publish' })
  }

  const published: any[] = []
  const errors: string[] = []

  // Publish serially to avoid Vercel timeout / API rate limits
  for (const article of articles as ScoredArticle[]) {
    try {
      const post = await writeFromArticle(article)
      const heroImage = await generateHeroImage(
        post.title,
        article.whyItMatters,
        post.category,
        article.url,
        post.body
      )
      const saved = await publishBlogPost(post, heroImage)
      published.push({ ...saved, title: post.title, category: post.category })
    } catch (err: any) {
      console.error('[publish-custom] Failed for article:', article.title, err)
      errors.push(`${article.title}: ${err?.message ?? 'Unknown error'}`)
    }
  }

  return res.status(200).json({
    ok: true,
    published: published.length,
    posts: published,
    errors: errors.length > 0 ? errors : undefined,
  })
}
