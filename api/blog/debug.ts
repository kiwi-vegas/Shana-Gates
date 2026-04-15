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

  // ── 5. Env var presence check ─────────────────────────────────────────
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
