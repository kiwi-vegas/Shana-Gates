import Anthropic from '@anthropic-ai/sdk'
import { tavily } from 'tavily'
import type { ScoredArticle } from './blog-store'

// ── Coachella Valley topic queries (rotate 8 of 25 per day) ───────────────

const TOPIC_QUERIES = [
  'Coachella Valley real estate market trends 2026',
  'Palm Springs home prices housing market',
  'Palm Desert real estate news',
  'La Quinta Indian Wells Rancho Mirage housing market',
  'California real estate law changes 2026',
  'Palm Springs short-term rental ordinance Airbnb',
  'Coachella Valley luxury home sales',
  'California property tax Prop 19 homeowners',
  'Coachella Valley investment property vacation rental ROI',
  'Palm Springs housing inventory buyers market',
  'California HOA law changes homeowners',
  'Coachella Valley new development construction',
  'Desert real estate appreciation forecast',
  'Coachella Festival Stagecoach housing demand',
  'Palm Springs snowbird real estate demand',
  'California first-time homebuyer programs 2026',
  'Coachella Valley retirement communities active adult',
  'La Quinta PGA West golf community real estate',
  'Cathedral City Indio Coachella housing market',
  'Palm Desert El Paseo luxury real estate',
  'California mortgage rates affordability 2026',
  'Desert Hot Springs real estate investment',
  'Rancho Mirage Indian Wells luxury market update',
  'Coachella Valley commercial real estate development',
  'Southern California housing market forecast',
]

function getDailyQueries(date: string): string[] {
  // Deterministic rotation based on date
  const seed = date.replace(/-/g, '')
  const offset = parseInt(seed.slice(-2), 10) % TOPIC_QUERIES.length
  const rotated = [...TOPIC_QUERIES.slice(offset), ...TOPIC_QUERIES.slice(0, offset)]
  return rotated.slice(0, 8)
}

// ── Tavily search ─────────────────────────────────────────────────────────

interface TavilyResult {
  title: string
  url: string
  content: string
  published_date?: string
  score?: number
}

async function searchTavily(query: string): Promise<TavilyResult[]> {
  const client = tavily({ apiKey: process.env.TAVILY_API_KEY! })
  const result = await client.search(query, {
    search_depth: 'basic',
    max_results: 5,
    include_answer: false,
    include_raw_content: false,
  })
  return (result.results ?? []) as TavilyResult[]
}

// ── Claude Opus scoring ───────────────────────────────────────────────────

const SCORING_SYSTEM = `You are a real estate content curator for Shana Gates, REALTOR® at Craft & Bauer | Real Broker in the Coachella Valley, CA.

Your job: score and categorize news articles by their relevance and value to Shana's clients — Coachella Valley buyers, sellers, and real estate investors.

SCORING RULES:
- Score 1–10 based on relevance to the Coachella Valley / Palm Springs area market
- Score 1 and DROP articles about other markets (Las Vegas, Texas, Florida, Northeast, etc.) unless they directly affect CA buyers
- Score 8–10: Directly about Coachella Valley, Palm Springs, or CA real estate law with local impact
- Score 5–7: National trends or CA-wide news that meaningfully affects local buyers/sellers
- Score 1–4: Tangentially relevant or mostly about other markets

CATEGORIES (pick the single best fit):
- market-update: prices, inventory, market conditions, forecasts
- buying-tips: homebuyer advice, financing, offers, inspections
- selling-tips: seller strategy, staging, pricing, timing
- community-spotlight: specific Coachella Valley city or neighborhood features
- investment: rental properties, ROI, STR, vacation homes
- news: policy, law, regulatory changes, major developments
- local-area: lifestyle, events, amenities, things to do in the valley

COMPLIANCE — never select or recommend articles that mention:
- School quality, ratings, or test scores
- Safety of neighborhoods or demographic composition
- Any language that could be seen as steering or profiling

Return a JSON array of scored articles. Include only articles with score >= 5.`

async function scoreArticles(rawArticles: TavilyResult[]): Promise<ScoredArticle[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const prompt = `Score and categorize these articles for relevance to the Coachella Valley real estate market:

${JSON.stringify(rawArticles.map((a, i) => ({ id: i, title: a.title, url: a.url, content: a.content.slice(0, 500) })), null, 2)}

Return JSON array with this shape for each article with score >= 5:
[{
  "id": "article-{i}",
  "url": "...",
  "title": "...",
  "source": "domain from URL",
  "publishedDate": "YYYY-MM-DD or empty string",
  "summary": "2-3 sentence summary for Shana",
  "score": 1-10,
  "category": "one of the category values",
  "whyItMatters": "1 sentence: why Coachella Valley clients should care"
}]

Return ONLY valid JSON, no markdown, no commentary.`

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
    system: SCORING_SYSTEM,
  })

  const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')

  try {
    return JSON.parse(text) as ScoredArticle[]
  } catch {
    // Try extracting JSON array from response
    const match = text.match(/\[[\s\S]*\]/)
    if (match) return JSON.parse(match[0]) as ScoredArticle[]
    return []
  }
}

// ── Main research function ────────────────────────────────────────────────

export async function runDailyResearch(date: string): Promise<ScoredArticle[]> {
  const queries = getDailyQueries(date)

  // Search all queries in parallel
  const searchResults = await Promise.all(queries.map((q) => searchTavily(q).catch(() => [])))
  const allResults = searchResults.flat()

  // Deduplicate by URL
  const seen = new Set<string>()
  const uniqueResults = allResults.filter((r) => {
    if (seen.has(r.url)) return false
    seen.add(r.url)
    return true
  })

  // Score with Claude Opus (batch of up to 30)
  const toScore = uniqueResults.slice(0, 30)
  const scored = await scoreArticles(toScore)

  // Sort by score descending, return top 10
  return scored.sort((a, b) => b.score - a.score).slice(0, 10)
}
