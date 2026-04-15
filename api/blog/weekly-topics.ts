import { getWeeklyTopics } from '../../lib/blog-store'

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Auth
  const adminSecret = process.env.ADMIN_SECRET
  if (adminSecret && req.query?.secret !== adminSecret) {
    const cookies = parseCookies(req.headers.cookie)
    if (!cookies['sg_assistant_session']) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  try {
    const topics = await getWeeklyTopics()
    return res.status(200).json({ topics })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {}
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=')
      return [k.trim(), v.join('=')]
    })
  )
}
