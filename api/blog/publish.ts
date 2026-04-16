import { createHmac } from 'crypto'
import { getDailyArticles } from '../../lib/blog-store'
import { writeFromArticle } from '../../lib/writer'
import { generateHeroImage } from '../../lib/blog-images'
import { publishBlogPost, uploadImageAsset } from '../../lib/blog-sanity'
import { injectImagesIntoBody, type ApprovedSelection } from '../../lib/blog-inline-images'

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

  const { date, articleIds, imageSelections } = req.body ?? {}
  const imageSelectionsMap: Record<string, ApprovedSelection[]> = {}
  if (Array.isArray(imageSelections)) {
    for (const entry of imageSelections) {
      if (entry.itemId && Array.isArray(entry.placements)) {
        imageSelectionsMap[entry.itemId] = entry.placements
      }
    }
  }

  if (!date || !Array.isArray(articleIds) || articleIds.length === 0) {
    return res.status(400).json({ error: 'date and articleIds[] required' })
  }

  if (articleIds.length > MAX_ARTICLES) {
    return res.status(400).json({ error: `Maximum ${MAX_ARTICLES} articles per publish` })
  }

  // Load stored articles for this date
  let allArticles: Awaited<ReturnType<typeof getDailyArticles>>
  try {
    allArticles = await getDailyArticles(date)
  } catch (err) {
    console.error('[publish] Redis error loading articles:', err)
    return res.status(500).json({ error: 'Could not load articles from cache. Try again.' })
  }

  const selected = allArticles.filter((a) => articleIds.includes(a.id))

  if (selected.length === 0) {
    return res.status(404).json({ error: 'No matching articles found for this date' })
  }

  // Upload any user-provided images to Sanity before writing posts
  for (const selections of Object.values(imageSelectionsMap)) {
    for (const sel of selections) {
      if (sel.photo.source === 'upload' && sel.photo.dataUrl) {
        try {
          const base64 = sel.photo.dataUrl.split(',')[1]
          const buffer = Buffer.from(base64, 'base64')
          const url = await uploadImageAsset(buffer, `upload-${Date.now()}.jpg`)
          sel.photo.regularUrl = url
          delete sel.photo.dataUrl
        } catch (err) {
          console.error('[publish] Failed to upload user image to Sanity:', err)
          // Fall back to skipping this image rather than failing the whole post
          sel.photo.source = undefined
          sel.photo.regularUrl = ''
        }
      }
    }
  }

  // Write + publish in parallel
  const results = await Promise.allSettled(
    selected.map(async (article) => {
      const post = await writeFromArticle(article)
      const approvedPlacements = imageSelectionsMap[article.id]
      if (approvedPlacements?.length) {
        post.body = injectImagesIntoBody(post.body, approvedPlacements)
      }
      const heroImage = await generateHeroImage(
        post.title,
        article.whyItMatters,
        post.category,
        article.url,
        post.body
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
