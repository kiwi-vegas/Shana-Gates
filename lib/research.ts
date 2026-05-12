import Anthropic from '@anthropic-ai/sdk'
import { tavily } from '@tavily/core'
import type { ScoredArticle } from './blog-store'
import type { IdeaCandidate, IdeaAudience, ArticleCategory } from './types'
import { computeTimeliness, computeSourceCredibility, computeNovelty, assembleScore, SCORE_THRESHOLD } from './scoring'
import { sourceTypeLabel } from './source-rules'
import { saveIdea, getCoveredTopics, buildWeekId } from './idea-store'

// ── Coachella Valley topic queries (rotate 10 per day) ────────────────────────

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
  const seed = date.replace(/-/g, '')
  const offset = parseInt(seed.slice(-2), 10) % TOPIC_QUERIES.length
  const rotated = [...TOPIC_QUERIES.slice(offset), ...TOPIC_QUERIES.slice(0, offset)]
  return rotated.slice(0, 10)
}

// ── Tavily search ─────────────────────────────────────────────────────────────

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

// ── Claude Opus scoring ───────────────────────────────────────────────────────

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
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  try {
    return JSON.parse(text) as ScoredArticle[]
  } catch {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) return JSON.parse(match[0]) as ScoredArticle[]
    return []
  }
}

// ── IdeaCandidate generation ──────────────────────────────────────────────────

const AUDIENCE_MAP: Record<string, IdeaAudience[]> = {
  'market-update':   ['buyer', 'seller', 'investor', 'homeowner'],
  'investor-tips':   ['investor'],
  'seller-tips':     ['seller', 'homeowner'],
  'community':       ['buyer', 'local'],
  'trending-topics': ['buyer', 'seller', 'local'],
}

const CONTENT_TYPE_MAP: Record<string, string> = {
  'market-update':   'Market Update',
  'investor-tips':   'Investor Tips',
  'seller-tips':     'Seller Tips',
  'community':       'Community',
  'trending-topics': 'Trending',
}

const CV_CITIES = [
  'Palm Springs', 'Palm Desert', 'Rancho Mirage', 'Indian Wells',
  'La Quinta', 'Indio', 'Cathedral City', 'Desert Hot Springs', 'Coachella',
]

function detectCityTarget(text: string): string | undefined {
  const lower = text.toLowerCase()
  for (const city of CV_CITIES) {
    if (lower.includes(city.toLowerCase())) return city
  }
  return undefined
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

async function articlesToIdeas(
  articles: ScoredArticle[],
  rawResults: TavilyResult[],
): Promise<IdeaCandidate[]> {
  const coveredTopics = await getCoveredTopics()
  const weekId = buildWeekId()
  const ideas: IdeaCandidate[] = []

  for (const article of articles) {
    // Map old 1-10 score to LLM dimensions
    // localRelevance: anchored to article score (max 25)
    const localRelevance = Math.min(25, Math.round(article.score * 2.5))
    const formatFit      = 10
    const audienceValue  = 12
    const seoPotential   = article.score >= 8 ? 5 : article.score >= 6 ? 3 : 2

    const domain = extractDomain(article.url)
    const { score: timelinessScore, urgency } = computeTimeliness(article.publishedDate || undefined)
    const sourceCredibility = computeSourceCredibility([domain])
    const novelty = computeNovelty(article.title, coveredTopics)

    const assembled = assembleScore(
      { localRelevance, formatFit, audienceValue, seoPotential },
      timelinessScore,
      sourceCredibility,
      novelty,
      [domain],
      article.category,
    )

    if (assembled.total < SCORE_THRESHOLD) continue

    // Find original Tavily result for full content
    const original = rawResults.find((r) => r.url === article.url)

    const idea: IdeaCandidate = {
      id: `sgs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      weekId,
      source: 'daily-research',
      title: article.title,
      angle: article.whyItMatters,
      whyItMatters: article.summary,
      category: article.category as ArticleCategory,
      audiences: AUDIENCE_MAP[article.category] ?? ['buyer', 'seller'],
      contentType: CONTENT_TYPE_MAP[article.category] ?? 'Article',
      urgency,
      score: assembled,
      sourceUrls: [article.url],
      sourceDomains: [domain],
      sourceLabels: [sourceTypeLabel(domain)],
      researchData: original?.content?.slice(0, 3000) ?? article.summary,
      targetKeyword: article.title.split(' ').slice(0, 5).join(' '),
      cityTarget: detectCityTarget(article.title + ' ' + article.summary),
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    ideas.push(idea)
  }

  return ideas
}

// ── Main research function ────────────────────────────────────────────────────

export async function runDailyResearch(date: string): Promise<ScoredArticle[]> {
  const queries = getDailyQueries(date)

  const searchResults = await Promise.all(queries.map((q) => searchTavily(q).catch(() => [])))
  const allResults = searchResults.flat()

  // Deduplicate by URL
  const seen = new Set<string>()
  const uniqueResults = allResults.filter((r) => {
    if (seen.has(r.url)) return false
    seen.add(r.url)
    return true
  })

  const toScore = uniqueResults.slice(0, 30)
  const scored = await scoreArticles(toScore)
  const top10 = scored.sort((a, b) => b.score - a.score).slice(0, 10)

  // Generate IdeaCandidates for the new idea pipeline (fire-and-forget)
  articlesToIdeas(top10, uniqueResults)
    .then((ideas) => Promise.all(ideas.map((idea) => saveIdea(idea))))
    .catch((err) => console.error('[research] Failed to save ideas:', err))

  return top10
}
