import { createHmac } from 'crypto'
import { getPostBySlug, publishQueuedPost } from '../../lib/blog-redis'

// Phase B: import and wire in Blotato here
// import { publishToFacebook } from '../../lib/blotato-client'

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

  const { slug } = req.body ?? {}
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'slug required' })
  }

  const post = await getPostBySlug(slug)
  if (!post) return res.status(404).json({ error: 'Post not found' })

  if (!['media_ready', 'media_pending'].includes(post.workflowStatus ?? '')) {
    return res.status(400).json({
      error: `Post is not ready to publish (status: ${post.workflowStatus})`,
    })
  }

  try {
    // Phase A: publish to website only
    await publishQueuedPost(slug)

    // Phase B: also post to Facebook
    // Uncomment when BLOTATO_KEY, BLOTATO_ACCOUNT_ID, BLOTATO_FACEBOOK_PAGE_ID are set
    //
    // if (post.heroImageUrl && post.socialCopy && process.env.BLOTATO_KEY) {
    //   const appUrl = process.env.APP_URL ?? 'https://shanasells.com'
    //   const caption = `${post.socialCopy}\n\n${appUrl}/blog/post/${post.slug}`
    //   const { postSubmissionId } = await publishToFacebook(caption, post.heroImageUrl)
    //   return res.status(200).json({ ok: true, postSubmissionId })
    // }

    return res.status(200).json({ ok: true, postSubmissionId: null })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Publish failed' })
  }
}
