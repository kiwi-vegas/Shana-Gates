import { createHmac } from 'crypto'
import { getWeeklyTopics } from '../../lib/blog-store'
import { writeFromTopic } from '../../lib/writer'
import { generateHeroImage } from '../../lib/blog-images'
import { publishBlogPost } from '../../lib/blog-sanity'
import { injectImagesIntoBody, type ApprovedSelection } from '../../lib/blog-inline-images'

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

  const { topicIds, imageSelections } = req.body ?? {}
  const imageSelectionsMap: Record<string, ApprovedSelection[]> = {}
  if (Array.isArray(imageSelections)) {
    for (const entry of imageSelections) {
      if (entry.itemId && Array.isArray(entry.placements)) {
        imageSelectionsMap[entry.itemId] = entry.placements
      }
    }
  }

  if (!Array.isArray(topicIds) || topicIds.length === 0) {
    return res.status(400).json({ error: 'topicIds[] required' })
  }

  let allTopics: Awaited<ReturnType<typeof getWeeklyTopics>>
  try {
    allTopics = await getWeeklyTopics()
  } catch (err) {
    console.error('[publish-weekly] Redis error loading topics:', err)
    return res.status(500).json({ error: 'Could not load topics from cache. Try again.' })
  }

  const selected = allTopics.filter((t) => topicIds.includes(t.id))

  if (selected.length === 0) {
    return res.status(404).json({ error: 'No matching topics found — the weekly topics may have expired. Re-run the weekly research.' })
  }

  // Write + publish serially to avoid parallel API timeouts
  const published: any[] = []
  const failed: string[] = []

  for (const topic of selected) {
    try {
      const post = await writeFromTopic(topic)
      const approvedPlacements = imageSelectionsMap[topic.id]
      if (approvedPlacements?.length) {
        post.body = injectImagesIntoBody(post.body, approvedPlacements)
      }
      const heroImage = await generateHeroImage(
        post.title,
        topic.angle,
        post.category,
        '',
        post.body
      )
      const result = await publishBlogPost(post, heroImage)
      published.push({ ...result, title: post.title, category: post.category })
    } catch (err) {
      console.error(`[publish-weekly] Failed to publish topic "${topic.title}":`, err)
      failed.push(`${topic.title}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return res.status(200).json({
    ok: true,
    published: published.length,
    posts: published,
    errors: failed.length > 0 ? failed : undefined,
  })
}
