import { runWeeklyResearch } from '../../lib/weekly-research'
import { storeWeeklyTopics } from '../../lib/blog-store'
import { sendWeeklyDigest } from '../../lib/blog-email'

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.authorization
    const bodySecret = req.body?.secret
    const querySecret = req.query?.secret
    if (
      authHeader !== `Bearer ${cronSecret}` &&
      bodySecret !== cronSecret &&
      querySecret !== cronSecret
    ) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  try {
    console.log('[weekly] Running weekly topic research')
    const topics = await runWeeklyResearch()
    console.log(`[weekly] Generated ${topics.length} topic ideas`)

    if (topics.length === 0) {
      return res.status(200).json({ ok: true, topicsGenerated: 0 })
    }

    // Store in Redis
    await storeWeeklyTopics(topics)
    console.log('[weekly] Stored topics in Redis')

    // Send Sunday digest email
    await sendWeeklyDigest(topics)
    console.log('[weekly] Sent Sunday digest email')

    return res.status(200).json({ ok: true, topicsGenerated: topics.length })
  } catch (err) {
    console.error('[weekly] Error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
