import { getDailyArticles, getLatestDailyArticles } from '../../lib/blog-store'

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Auth
  const adminSecret = process.env.ADMIN_SECRET
  if (adminSecret && req.query?.secret !== adminSecret) {
    // Also check session cookie (same as assistant)
    const cookies = parseCookies(req.headers.cookie)
    if (!cookies['sg_assistant_session']) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  try {
    if (req.query?.date) {
      const articles = await getDailyArticles(req.query.date as string)
      return res.status(200).json({ articles, date: req.query.date })
    }

    const { date, articles } = await getLatestDailyArticles()
    return res.status(200).json({ articles, date })
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
