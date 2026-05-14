import { createHmac } from 'crypto'
import { put } from '@vercel/blob'
import { getHeyGenVideoStatus } from '../../lib/heygen-client'

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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.ADMIN_SECRET
  if (!secret) return res.status(500).json({ error: 'Not configured' })

  const cookies = parseCookies(req.headers.cookie)
  const token = cookies[COOKIE_NAME]
  if (!token || !verifyToken(token, secret)) return res.status(401).json({ error: 'Unauthorized' })

  const videoId = req.query?.videoId
  if (!videoId || typeof videoId !== 'string') return res.status(400).json({ error: 'videoId is required' })

  try {
    const result = await getHeyGenVideoStatus(videoId)

    if (result.status !== 'completed') {
      return res.status(200).json(result)
    }

    // Stream the video from HeyGen into Vercel Blob for a permanent URL
    const videoRes = await fetch(result.videoUrl, { signal: AbortSignal.timeout(50000) })
    if (!videoRes.ok) throw new Error(`Failed to fetch HeyGen video (${videoRes.status})`)

    const blob = await put(`heygen-${videoId}.mp4`, videoRes.body!, {
      access: 'public',
      contentType: 'video/mp4',
    })

    return res.status(200).json({
      status: 'completed',
      videoUrl: blob.url,
      duration: result.duration,
    })
  } catch (err: any) {
    console.error('[heygen-status]', err)
    return res.status(500).json({ error: err?.message ?? 'Status check failed' })
  }
}
