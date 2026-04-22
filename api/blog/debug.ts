/**
 * Debug endpoint — tests each blog pipeline component individually.
 * GET /api/blog/debug?secret=CRON_SECRET&step=tavily|score|redis|email
 */
import Anthropic from '@anthropic-ai/sdk'
import { tavily } from '@tavily/core'
import { Redis } from '@upstash/redis'
import { Resend } from 'resend'

export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.query?.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const step = req.query?.step ?? 'all'
  const results: Record<string, any> = {}

  // ── 1. Tavily ──────────────────────────────────────────────────────────
  if (step === 'all' || step === 'tavily') {
    try {
      const client = tavily({ apiKey: process.env.TAVILY_API_KEY! })
      const result = await client.search('Palm Springs real estate 2026', {
        searchDepth: 'basic',
        maxResults: 3,
      })
      results.tavily = {
        ok: true,
        count: result.results?.length ?? 0,
        first: result.results?.[0]?.title ?? null,
      }
    } catch (e: any) {
      results.tavily = { ok: false, error: e.message }
    }
  }

  // ── 2. Claude Opus scoring ────────────────────────────────────────────
  if (step === 'all' || step === 'score') {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Reply with just the word OK' }],
      })
      results.claude = {
        ok: true,
        reply: response.content[0]?.type === 'text' ? response.content[0].text : '?',
      }
    } catch (e: any) {
      results.claude = { ok: false, error: e.message }
    }
  }

  // ── 3. Redis ──────────────────────────────────────────────────────────
  if (step === 'all' || step === 'redis') {
    try {
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      })
      await redis.set('debug_test', 'hello', { ex: 60 })
      const val = await redis.get('debug_test')
      results.redis = { ok: true, roundtrip: val === 'hello' }
    } catch (e: any) {
      results.redis = { ok: false, error: e.message }
    }
  }

  // ── 4. Resend email ───────────────────────────────────────────────────
  if (step === 'all' || step === 'email') {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY!)
      const result = await resend.emails.send({
        from: process.env.FROM_EMAIL!,
        to: process.env.OPERATOR_EMAIL!,
        subject: '✅ Blog pipeline test email — Shana Gates',
        html: '<h2>It works!</h2><p>The Shana Gates blog pipeline email system is connected and working.</p>',
      })
      results.email = { ok: !result.error, id: result.data?.id, error: result.error?.message }
    } catch (e: any) {
      results.email = { ok: false, error: e.message }
    }
  }

  // ── 5. Full research trace (Tavily → scoring) ────────────────────────
  if (step === 'research') {
    try {
      const client = tavily({ apiKey: process.env.TAVILY_API_KEY! })
      const tavilyResult = await client.search('Coachella Valley real estate market 2026', {
        searchDepth: 'basic',
        maxResults: 5,
      })
      const rawArticles = tavilyResult.results ?? []
      results.tavily_raw = { count: rawArticles.length, titles: rawArticles.map((r: any) => r.title) }

      // Try scoring
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
      const toScore = rawArticles.slice(0, 5).map((a: any, i: number) => ({
        id: i,
        title: a.title,
        url: a.url,
        content: (a.content ?? '').slice(0, 300),
      }))

      const prompt = `Score these articles (1-10) for Coachella Valley real estate relevance. Return ONLY a JSON array: [{"id":"article-0","url":"...","title":"...","source":"domain","publishedDate":"","summary":"...","score":8,"category":"market-update","whyItMatters":"..."}]. Articles:\n${JSON.stringify(toScore)}`

      const response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      })
      const rawText = response.content[0]?.type === 'text' ? response.content[0].text : ''
      results.claude_raw = rawText.slice(0, 500)

      // Try parse
      try {
        const match = rawText.match(/\[[\s\S]*\]/)
        const parsed = match ? JSON.parse(match[0]) : JSON.parse(rawText)
        results.scored = { count: parsed.length, first: parsed[0] }
      } catch (pe: any) {
        results.parse_error = pe.message
      }
    } catch (e: any) {
      results.research_error = e.message
    }
    return res.status(200).json(results)
  }

  // ── 6. Publish pipeline step-by-step trace ───────────────────────────
  if (step === 'publish-trace') {
    const { getWeeklyTopics } = await import('../../lib/blog-store')
    const { writeFromTopic } = await import('../../lib/writer')
    const { publishBlogPost } = await import('../../lib/blog-redis')

    // Step A: load topics from Redis
    const t0 = Date.now()
    try {
      const topics = await getWeeklyTopics()
      results.a_redis = { ok: true, count: topics.length, ms: Date.now() - t0 }

      if (topics.length === 0) {
        results.a_redis.note = 'No topics in Redis — run /api/cron/weekly first'
        return res.status(200).json(results)
      }

      // Step B: write one post with Claude (first topic)
      const topic = topics[0]
      results.b_topic = { id: topic.id, title: topic.title, category: topic.category }
      const t1 = Date.now()
      try {
        const post = await writeFromTopic(topic)
        results.b_write = { ok: true, ms: Date.now() - t1, title: post.title, bodyLength: post.body.length }

        // Step C: publish to Sanity (skip image gen — use static fallback URL)
        const t2 = Date.now()
        try {
          const heroImage = { imageUrl: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1792&h=1024&fit=crop' }
          const published = await publishBlogPost(post, heroImage)
          results.c_publish = { ok: true, ms: Date.now() - t2, slug: published.slug }
        } catch (e: any) {
          results.c_publish = { ok: false, ms: Date.now() - t2, error: e.message }
        }
      } catch (e: any) {
        results.b_write = { ok: false, ms: Date.now() - t1, error: e.message }
      }
    } catch (e: any) {
      results.a_redis = { ok: false, ms: Date.now() - t0, error: e.message }
    }
    return res.status(200).json(results)
  }

  // ── 7. Env var presence check ─────────────────────────────────────────
  if (step === 'all' || step === 'env') {
    const vars = [
      'TAVILY_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
      'RESEND_API_KEY', 'FROM_EMAIL', 'OPERATOR_EMAIL',
      'GOOGLE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
      'SANITY_WRITE_TOKEN', 'ADMIN_SECRET', 'CRON_SECRET',
    ]
    results.env = Object.fromEntries(vars.map(v => [v, !!process.env[v]]))
  }

  return res.status(200).json(results)
}
