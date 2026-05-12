/**
 * lib/fair-housing.ts
 *
 * Fair Housing Act compliance checking for all AI-generated content.
 * California law adds age and citizenship/immigration status to federal protections.
 *
 * Two-layer system:
 *   1. FAIR_HOUSING_RULES — inject into Claude prompts to prevent violations at generation time
 *   2. checkFairHousing()  — verify generated content before Sanity save or publish
 *
 * Redis keys (prefix sgs:):
 *   sgs:fh:{postId}   — FHCheckResult JSON, 90-day TTL
 */

import Anthropic from '@anthropic-ai/sdk'
import { Redis } from '@upstash/redis'

// ─── Prompt constant — inject into every writer prompt ────────────────────────

export const FAIR_HOUSING_RULES = `
FAIR HOUSING COMPLIANCE (required — non-negotiable):
All content must comply with the Fair Housing Act and California fair housing law (FEHA).
The legal standard is the "ordinary reader test": if a reasonable person could read
this as expressing preference for or against any protected group, it is a violation.
Intent is irrelevant.

Protected classes (California FEHA — broader than federal):
Race, color, religion, national origin, sex, disability, familial status,
marital status, sexual orientation, gender identity, source of income,
age, citizenship/immigration status.

NEVER:
- Use "family-friendly," "perfect for families," "great for growing families,"
  "perfect for empty nesters," "ideal for retirees," "adult community" (unless
  legally designated 55+ housing under CA law)
- Use "great for young professionals," "young couples," or age-coded language
- Reference specific churches, temples, mosques, or synagogues by name as amenities
- Describe neighborhood demographics by race, ethnicity, religion, or cultural origin
- Use "master bedroom" — use "primary bedroom" or "owner's suite" instead
- Use "man cave," "bachelor pad," "wife's dream kitchen," or gendered room descriptions
- Use "safe neighborhood" or "safe area" subjectively — only cite specific crime
  statistics with a named source
- Use "established neighborhood," "up-and-coming area," "exclusive enclave" without
  factual basis — these are often coded demographic signals
- Use "walking distance to [religious institution]"
- Suggest who should or shouldn't live in a property or neighborhood
- Use "quiet neighborhood" to imply no families/children
- Reference immigration status, citizenship, or national origin as neighborhood traits

ALWAYS:
- Describe the PROPERTY, its features, and objective amenities — never the ideal resident
- Use objective measurements for proximity: "0.4 miles from" or "8 minutes to"
- When referencing school quality, cite verifiable data: "[School Name], rated X/10
  by GreatSchools.org (year)"
- Use "primary bedroom" or "owner's suite," never "master bedroom"
- Describe community amenities factually: "community pool," "gated entry," "fitness
  center" — not who would enjoy them
`

// ─── Types ─────────────────────────────────────────────────────────────────────

export type FHViolation = {
  excerpt: string
  reason: string
  severity: 'warning' | 'violation'
  suggestion: string
}

export type FHCheckResult = {
  severity: 'clear' | 'warning' | 'violation'
  violations: FHViolation[]
  checkedAt: string
  reviewedAt?: string
}

export type FHContentType = 'blog-post' | 'social-caption' | 'video-script'

// ─── Compliance checker ────────────────────────────────────────────────────────

export async function checkFairHousing(
  content: string,
  contentType: FHContentType
): Promise<FHCheckResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[fair-housing] ANTHROPIC_API_KEY not set — skipping check')
    return { severity: 'clear', violations: [], checkedAt: new Date().toISOString() }
  }

  const anthropic = new Anthropic({ apiKey })

  const prompt = `You are a Fair Housing Act compliance reviewer for real estate marketing content.

Analyze the following ${contentType} for Fair Housing Act violations.

PROTECTED CLASSES (federal + California FEHA):
Race, Color, Religion, National Origin, Sex, Disability, Familial Status, Marital Status,
Sexual Orientation, Gender Identity, Source of Income, Age, Citizenship/Immigration Status

LEGAL STANDARD: "Ordinary reader test" — would a reasonable person interpret this content
as expressing a preference for or against any protected class? Intent is irrelevant.

HARD VIOLATIONS (severity: "violation"):
- "family-friendly," "perfect for families," "great for families," "great for growing families"
- "perfect for empty nesters," "ideal for retirees," "active adult," "mature community"
- "great for young professionals," "young couples" — age-coded language
- Named religious institutions as location amenities (e.g., "near St. Mary's Church")
- "master bedroom" (use "primary bedroom")
- "man cave," "wife's dream kitchen," "bachelor pad," gendered room descriptions
- Demographic descriptions of neighborhoods (racial, ethnic, religious, cultural)
- "safe neighborhood" / "safe area" without a cited, verifiable source
- "established neighborhood," "up-and-coming area," "exclusive enclave" when used
  as demographic code
- "quiet neighborhood" implying no families with children

CONTEXTUAL WARNINGS (severity: "warning"):
- "walking distance to [specific religious institution]"
- "great schools" without citing specific school name + verifiable rating source
- "sought-after neighborhood" without objective explanation
- "close-knit community" without factual context

SAFE LANGUAGE: property features, objective measurements (miles/minutes), cited statistics,
school names with verifiable ratings, factual amenity descriptions.

CONTENT TO REVIEW:
---
${content.slice(0, 8000)}
---

Return a JSON object ONLY (no markdown, no explanation):
{
  "severity": "clear" | "warning" | "violation",
  "violations": [
    {
      "excerpt": "the exact phrase that is problematic",
      "reason": "which protected class and why this triggers it",
      "severity": "warning" | "violation",
      "suggestion": "compliant alternative phrasing"
    }
  ]
}

If the content is fully compliant, return:
{"severity": "clear", "violations": []}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[fair-housing] Could not parse check response:', text.slice(0, 200))
      return { severity: 'clear', violations: [], checkedAt: new Date().toISOString() }
    }

    const parsed = JSON.parse(jsonMatch[0])
    return {
      severity: parsed.severity ?? 'clear',
      violations: Array.isArray(parsed.violations) ? parsed.violations : [],
      checkedAt: new Date().toISOString(),
    }
  } catch (err: any) {
    console.error('[fair-housing] Check failed:', err?.message)
    return { severity: 'clear', violations: [], checkedAt: new Date().toISOString() }
  }
}

// ─── Redis storage ─────────────────────────────────────────────────────────────

const FH_TTL = 90 * 24 * 60 * 60 // 90 days

function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN')
  return new Redis({ url, token })
}

function fhKey(postId: string) { return `sgs:fh:${postId}` }

export async function saveFHResult(postId: string, result: FHCheckResult): Promise<void> {
  const redis = getRedis()
  await redis.set(fhKey(postId), JSON.stringify(result), { ex: FH_TTL })
}

export async function getFHResult(postId: string): Promise<FHCheckResult | null> {
  const redis = getRedis()
  const raw = await redis.get<string>(fhKey(postId))
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

export async function markFHReviewed(postId: string): Promise<void> {
  const redis = getRedis()
  const existing = await getFHResult(postId)
  if (!existing) return
  const updated: FHCheckResult = { ...existing, reviewedAt: new Date().toISOString() }
  await redis.set(fhKey(postId), JSON.stringify(updated), { ex: FH_TTL })
}
