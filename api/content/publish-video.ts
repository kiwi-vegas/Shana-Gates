import { createHmac } from 'crypto'
import { getPostBySlug } from '../../lib/blog-redis'
import {
  publishToFacebookReel, publishToYouTube, publishToTikTok,
  publishToLinkedIn, publishToX, publishToThreads, publishToInstagramReel,
} from '../../lib/blotato-client'
import {
  generatePlatformCaptions,
  buildTikTokCaption, buildLinkedInCaption, buildXCaption,
  buildThreadsCaption, buildInstagramCaption,
  SITE_URL,
} from '../../lib/publish-service'

const COOKIE_NAME = 'sg_assistant_session'

function parseCookies(h: string | undefined): Record<string, string> {
  if (!h) return {}
  return Object.fromEntries(h.split(';').map(c => { const [k, ...v] = c.trim().split('='); return [k.trim(), v.join('=')] }))
}
function verifyToken(token: string, secret: string): boolean {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return false
  return createHmac('sha256', secret).update(token.slice(0, dot)).digest('hex') === token.slice(dot + 1)
}

export const config = { maxDuration: 60 }

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.ADMIN_SECRET
  if (!secret) return res.status(500).json({ error: 'Not configured' })

  const cookies = parseCookies(req.headers.cookie)
  const token = cookies[COOKIE_NAME]
  if (!token || !verifyToken(token, secret)) return res.status(401).json({ error: 'Unauthorized' })

  const { slug, videoUrl, videoThumbnailUrl } = req.body ?? {}
  if (!slug) return res.status(400).json({ error: 'slug is required' })
  if (!videoUrl) return res.status(400).json({ error: 'videoUrl is required' })

  const post = await getPostBySlug(slug)
  if (!post) return res.status(404).json({ error: 'Post not found' })

  const articleUrl = `${SITE_URL}/blog/post.html?slug=${post.slug}`

  const captions = post.socialCopy
    ? {
        facebook:  post.socialCopy,
        youtube:   post.socialCopy,
        linkedin:  post.socialCopy,
        twitter:   post.title,
        tiktok:    post.socialCopy,
        threads:   post.socialCopy,
        instagram: post.socialCopy,
      }
    : await generatePlatformCaptions(post)

  const fbCopy    = `${captions.facebook}\n\n${articleUrl}`
  const ytDesc    = `${captions.youtube}\n\n${articleUrl}`
  const liCopy    = buildLinkedInCaption(captions.linkedin, post.category, articleUrl)
  const twCopy    = buildXCaption(captions.twitter, post.category, articleUrl)
  const ttCopy    = buildTikTokCaption(captions.tiktok, post.category, articleUrl)
  const thCopy    = buildThreadsCaption(captions.threads, articleUrl)
  const igCopy    = buildInstagramCaption(captions.instagram, post.category, articleUrl)

  const [reelOut, ytOut, ttOut, liOut, twOut, thOut, igOut] = await Promise.allSettled([
    publishToFacebookReel(fbCopy, videoUrl),
    publishToYouTube(post.title, ytDesc, videoUrl, videoThumbnailUrl),
    publishToTikTok(ttCopy, videoUrl),
    publishToLinkedIn(liCopy, videoUrl),
    publishToX(twCopy, videoUrl),
    publishToThreads(thCopy, videoUrl),
    publishToInstagramReel(igCopy, videoUrl),
  ])

  function outcome(r: PromiseSettledResult<{ postSubmissionId: string }>, label: string) {
    return r.status === 'fulfilled'
      ? { postSubmissionId: r.value.postSubmissionId }
      : { error: r.reason instanceof Error ? r.reason.message : `${label} failed` }
  }

  return res.status(200).json({
    ok: true,
    facebookReel:   outcome(reelOut, 'Facebook Reel'),
    youtube:        outcome(ytOut,   'YouTube'),
    tiktok:         outcome(ttOut,   'TikTok'),
    linkedin:       outcome(liOut,   'LinkedIn'),
    twitter:        outcome(twOut,   'X / Twitter'),
    threads:        outcome(thOut,   'Threads'),
    instagramReel:  outcome(igOut,   'Instagram Reel'),
  })
}
