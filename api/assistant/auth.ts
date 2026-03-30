import { createHmac } from 'crypto'

const COOKIE_NAME = 'sg_assistant_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

function signToken(secret: string): string {
  const payload = `assistant:${Date.now()}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${sig}`
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
  if (req.method === 'POST') {
    const { password } = req.body ?? {}
    const correctPassword = process.env.ASSISTANT_PASSWORD
    const secret = process.env.ADMIN_SECRET

    if (!correctPassword || !secret) {
      return res.status(500).json({ error: 'Not configured' })
    }

    if (password !== correctPassword) {
      return res.status(401).json({ error: 'Incorrect password' })
    }

    const token = signToken(secret)
    const secure = process.env.VERCEL_ENV === 'production' ? '; Secure' : ''
    res.setHeader(
      'Set-Cookie',
      `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`
    )
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

export { verifyToken, COOKIE_NAME }
