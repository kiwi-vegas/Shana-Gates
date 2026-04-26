import { createHmac } from 'crypto'
import { markPostReady, uploadImageAsset } from '../../lib/blog-redis'

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

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.ADMIN_SECRET
  if (!secret) return res.status(500).json({ error: 'Not configured' })

  const cookies = parseCookies(req.headers.cookie)
  const token = cookies[COOKIE_NAME]
  if (!token || !verifyToken(token, secret)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { slug, socialCopy, heroImageBase64, heroImageUrl } = req.body ?? {}
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'slug required' })
  }

  let finalHeroImageUrl: string | undefined = heroImageUrl || undefined

  // If a new thumbnail was uploaded as base64, upload it to Vercel Blob
  if (heroImageBase64 && typeof heroImageBase64 === 'string') {
    try {
      const base64Data = heroImageBase64.split(',')[1] ?? heroImageBase64
      const buffer = Buffer.from(base64Data, 'base64')
      finalHeroImageUrl = await uploadImageAsset(
        buffer,
        `thumbnail-${slug}-${Date.now()}.jpg`,
        'image/jpeg'
      )
    } catch (err: any) {
      return res.status(500).json({ error: `Image upload failed: ${err?.message}` })
    }
  }

  try {
    await markPostReady(slug, socialCopy ?? '', finalHeroImageUrl)
    return res.status(200).json({ ok: true })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Failed to mark ready' })
  }
}
