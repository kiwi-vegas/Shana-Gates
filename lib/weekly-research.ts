import Anthropic from '@anthropic-ai/sdk'
import { tavily } from '@tavily/core'
import type { WeeklyTopic } from './blog-store'

// ── Categories for weekly original content ────────────────────────────────

const WEEKLY_CATEGORIES = [
  {
    key: 'local-area',
    label: 'Local Area Topic',
    description: 'Seasonal events, local amenities, lifestyle features, things to do in specific Coachella Valley cities',
    searchQuery: 'Coachella Valley Palm Springs events lifestyle amenities 2026',
  },
  {
    key: 'market-insight',
    label: 'Market Insight',
    description: 'Current MLS data analysis, price trends, inventory interpretation for the valley',
    searchQuery: 'Coachella Valley Palm Springs housing market data inventory 2026',
  },
  {
    key: 'buying-tips',
    label: 'Buyer/Seller Advice',
    description: 'Desert-specific buying or selling tips, pricing strategies, staging, seasonal timing',
    searchQuery: 'Palm Springs desert home buying selling tips real estate advice',
  },
  {
    key: 'community-spotlight',
    label: 'Community Spotlight',
    description: 'Deep-dive on one Coachella Valley city — lifestyle, market, what makes it unique',
    searchQuery: 'Coachella Valley city neighborhood guide Palm Springs Palm Desert La Quinta',
  },
  {
    key: 'investment',
    label: 'Investment',
    description: 'STR ROI analysis, vacation property buying guide, desert market investment outlook',
    searchQuery: 'Coachella Valley Palm Springs vacation rental investment Airbnb ROI 2026',
  },
]

// ── Tavily search ─────────────────────────────────────────────────────────

interface TavilyResult {
  title: string
  url: string
  content: string
}

async function searchTavily(query: string): Promise<TavilyResult[]> {
  const client = tavily({ apiKey: process.env.TAVILY_API_KEY! })
  const result = await client.search(query, {
    searchDepth: 'basic',
    maxResults: 5,
  })
  return (result.results ?? []) as TavilyResult[]
}

// ── Claude Opus topic generation ──────────────────────────────────────────

const TOPIC_SYSTEM = `You are a blog content strategist for Shana Gates, REALTOR® at Craft & Bauer | Real Broker in the Coachella Valley, CA.

Your job: generate original, high-value blog post topic ideas for each content category. These are NOT news articles — they are original posts Shana's team will write to build local authority, attract buyers and sellers, and rank on Google.

WRITING VOICE: Shana Gates, experienced Coachella Valley REALTOR®
MARKET: Palm Springs, Palm Desert, Rancho Mirage, Indian Wells, La Quinta, Indio, Cathedral City, Desert Hot Springs, Coachella

TOPIC RULES:
- Each topic must be specific and actionable — not generic
- Use real Coachella Valley context (specific cities, landmarks, events, market dynamics)
- Topics should answer questions real buyers or sellers are Googling
- Tie in current market conditions, seasonal patterns, or timely local angles when possible

COMPLIANCE — never generate topics that mention:
- School quality, ratings, or test scores
- Safety of neighborhoods or demographic composition
- Any language that could be seen as steering or profiling`

async function generateTopicsForCategory(
  category: { key: string; label: string; description: string },
  context: TavilyResult[]
): Promise<WeeklyTopic[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const contextText = context
    .slice(0, 3)
    .map((r) => `- ${r.title}: ${r.content.slice(0, 300)}`)
    .join('\n')

  const prompt = `Generate 3 original blog post topic ideas for the category: **${category.label}**

Category description: ${category.description}

Recent context from the web:
${contextText}

Return a JSON array of exactly 3 topic ideas:
[{
  "id": "${category.key}-1",
  "category": "${category.key}",
  "title": "Engaging blog post headline (ready to publish)",
  "angle": "2-3 sentence description of what this post will cover and why readers will value it",
  "researchContext": "Key facts, data points, or talking points Claude should use when writing this post",
  "keywords": ["primary keyword", "secondary keyword", "long-tail keyword"]
}]

Return ONLY valid JSON, no markdown fences, no commentary.`

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
    system: TOPIC_SYSTEM,
  })

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    return JSON.parse(text) as WeeklyTopic[]
  } catch {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) return JSON.parse(match[0]) as WeeklyTopic[]
    return []
  }
}

// ── Main weekly research function ─────────────────────────────────────────

export async function runWeeklyResearch(): Promise<WeeklyTopic[]> {
  // Search all categories in parallel
  const results = await Promise.all(
    WEEKLY_CATEGORIES.map(async (cat) => {
      const context = await searchTavily(cat.searchQuery).catch(() => [])
      const topics = await generateTopicsForCategory(cat, context)
      return topics
    })
  )

  return results.flat()
}
