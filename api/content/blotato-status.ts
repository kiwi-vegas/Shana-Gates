import { createHmac } from 'crypto'
import { getPostStatus } from '../../lib/blotato-client'

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

  const postSubmissionId = req.query?.postSubmissionId
  if (!postSubmissionId || typeof postSubmissionId !== 'string') {
    return res.status(400).json({ error: 'postSubmissionId is required' })
  }

  try {
    const result = await getPostStatus(postSubmissionId)
    return res.status(200).json(result)
  } catch (err: any) {
    console.error('[blotato-status]', err)
    return res.status(500).json({ error: err?.message ?? 'Status check failed' })
  }
}
