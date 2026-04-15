import { createHmac } from 'crypto'
import { getDailyArticles } from '../../lib/blog-store'
import { writeFromArticle } from '../../lib/writer'
import { generateHeroImage } from '../../lib/blog-images'
import { publishBlogPost } from '../../lib/blog-sanity'

const COOKIE_NAME = 'sg_assistant_session'
const MAX_ARTICLES = 5

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

  // Auth via session cookie
  const secret = process.env.ADMIN_SECRET
  if (!secret) return res.status(500).json({ error: 'Not configured' })

  const cookies = parseCookies(req.headers.cookie)
  const token = cookies[COOKIE_NAME]
  if (!token || !verifyToken(token, secret)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { date, articleIds } = req.body ?? {}

  if (!date || !Array.isArray(articleIds) || articleIds.length === 0) {
    return res.status(400).json({ error: 'date and articleIds[] required' })
  }

  if (articleIds.length > MAX_ARTICLES) {
    return res.status(400).json({ error: `Maximum ${MAX_ARTICLES} articles per publish` })
  }

  // Load stored articles for this date
  const allArticles = await getDailyArticles(date)
  const selected = allArticles.filter((a) => articleIds.includes(a.id))

  if (selected.length === 0) {
    return res.status(404).json({ error: 'No matching articles found for this date' })
  }

  // Write + publish in parallel
  const results = await Promise.allSettled(
    selected.map(async (article) => {
      const post = await writeFromArticle(article)
      const heroImage = await generateHeroImage(
        post.title,
        article.whyItMatters,
        post.category,
        article.url
      )
      const published = await publishBlogPost(post, heroImage)
      return { ...published, title: post.title, category: post.category }
    })
  )

  const published = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value)

  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => r.reason?.message ?? 'Unknown error')

  return res.status(200).json({
    ok: true,
    published: published.length,
    posts: published,
    errors: failed.length > 0 ? failed : undefined,
  })
}
