import Anthropic from '@anthropic-ai/sdk'
import { tavily } from '@tavily/core'
import type { ScoredArticle } from './blog-store'

// ── Coachella Valley topic queries (rotate 8 of 35 per day) ───────────────
// Covers all 5 categories: market-update, investor-tips, seller-tips,
// community, trending-topics

const TOPIC_QUERIES = [
  // Market Updates
  'Coachella Valley real estate market trends 2026',
  'Palm Springs home prices housing market',
  'Palm Desert real estate news',
  'La Quinta Indian Wells Rancho Mirage housing market',
  'California real estate law changes 2026',
  'Palm Springs housing inventory buyers market',
  'California mortgage rates affordability 2026',
  'Desert real estate appreciation forecast',
  'Southern California housing market forecast',
  'Cathedral City Indio Coachella housing market',
  'California HOA law changes homeowners',
  'California property tax Prop 19 homeowners',
  // Investor Tips
  'Palm Springs short-term rental ordinance Airbnb',
  'Coachella Valley investment property vacation rental ROI',
  'Desert Hot Springs real estate investment',
  'Coachella Valley STR permit regulations 2026',
  'Airbnb VRBO vacation rental income Coachella Valley',
  'Rancho Mirage Indian Wells luxury market investment',
  // Seller Tips
  'home selling tips pricing strategy Coachella Valley 2026',
  'California home staging tips desert properties',
  'best time to sell home Palm Springs market',
  'Coachella Valley luxury home sales seller tips',
  'how to price home desert real estate market',
  // Community
  'Coachella Valley events things to do 2026',
  'Palm Springs community events farmers market 2026',
  'Palm Desert La Quinta local events activities',
  'Coachella Valley lifestyle amenities outdoor recreation',
  'Coachella Festival Stagecoach housing demand event impact',
  'Palm Springs snowbird season community events',
  'Coachella Valley new restaurant development lifestyle',
  // Trending Topics
  'celebrity real estate news 2026 famous home sale',
  'viral real estate trends 2026 interesting housing story',
  'luxury celebrity estate auction notable home',
  'Coachella Valley notable development project 2026',
  'California housing news trending real estate story',
]

function getDailyQueries(date: string): string[] {
  // Deterministic rotation based on date — picks 10 queries spread across all 5 categories
  const seed = date.replace(/-/g, '')
  const offset = parseInt(seed.slice(-2), 10) % TOPIC_QUERIES.length
  const rotated = [...TOPIC_QUERIES.slice(offset), ...TOPIC_QUERIES.slice(0, offset)]
  return rotated.slice(0, 10)
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
    searchDepth: 'basic',
    maxResults: 5,
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
- market-update: prices, inventory, market conditions, forecasts, mortgage rates, CA law changes affecting buyers/sellers, market analysis
- investor-tips: rental properties, ROI, STR/Airbnb, vacation homes, investment strategy, cap rates, short-term rental rules
- seller-tips: seller strategy, staging, pricing, timing, listing advice, preparing a home to sell
- community: Coachella Valley events, things to do, farmers markets, festivals, community news, city spotlights, local lifestyle, dining, outdoor recreation
- trending-topics: celebrity real estate news, viral or pop-culture real estate stories, notable property sales, interesting housing trends making national news, major development announcements

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
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
    system: SCORING_SYSTEM,
  })

  const raw = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')

  // Strip markdown code fences if present
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

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
