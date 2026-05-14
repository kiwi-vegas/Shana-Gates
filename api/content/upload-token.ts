import { createHmac } from 'crypto'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'

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

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.ADMIN_SECRET
  if (!secret) return res.status(500).json({ error: 'Not configured' })

  const cookies = parseCookies(req.headers.cookie)
  const token = cookies[COOKIE_NAME]
  if (!token || !verifyToken(token, secret)) return res.status(401).json({ error: 'Unauthorized' })

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (!blobToken) return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN not configured' })

  const filename = (req.query?.filename as string) ?? 'video.mp4'
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'mp4'
  const pathname = `videos/sg-${Date.now()}.${ext}`

  try {
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: blobToken,
      pathname,
      addRandomSuffix: false,
      maximumSizeInBytes: 500 * 1024 * 1024,
      allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'],
    })

    return res.status(200).json({
      token: clientToken,
      uploadUrl: `https://blob.vercel-storage.com/${pathname}`,
      pathname,
    })
  } catch (err: any) {
    console.error('[upload-token]', err)
    return res.status(500).json({ error: err?.message ?? 'Failed to generate upload token' })
  }
}
