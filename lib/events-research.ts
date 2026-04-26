import Anthropic from '@anthropic-ai/sdk'
import { tavily } from '@tavily/core'
import type { ScoredArticle } from './blog-store'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface TavilyResult {
  title: string
  url: string
  content: string
}

async function searchTavily(query: string): Promise<TavilyResult[]> {
  const client = tavily({ apiKey: process.env.TAVILY_API_KEY! })
  const result = await client.search(query, { searchDepth: 'basic', maxResults: 4 })
  return (result.results ?? []) as TavilyResult[]
}

export async function runEventsResearch(month: number, year: number): Promise<ScoredArticle[]> {
  const monthName = MONTH_NAMES[month - 1]

  const queries = [
    `Coachella Valley events ${monthName} ${year}`,
    `Greater Palm Springs things to do ${monthName} ${year}`,
    `Palm Springs events ${monthName} ${year}`,
    `Palm Desert events activities ${monthName} ${year}`,
    `La Quinta Rancho Mirage Indian Wells events ${monthName} ${year}`,
    `Indio Cathedral City events ${monthName} ${year}`,
    `Coachella Valley concerts festivals ${monthName} ${year}`,
    `Palm Springs VillageFest farmers market free events ${year}`,
  ]

  const settled = await Promise.allSettled(queries.map((q) => searchTavily(q)))

  const allResults: Array<{ title: string; url: string; snippet: string }> = []
  settled.forEach((r) => {
    if (r.status === 'fulfilled') {
      r.value.slice(0, 3).forEach((item) => {
        allResults.push({
          title: item.title ?? '',
          url: item.url ?? '',
          snippet: (item.content ?? '').slice(0, 280),
        })
      })
    }
  })

  // Deduplicate by URL
  const seen = new Set<string>()
  const deduped = allResults
    .filter((r) => {
      if (!r.url || seen.has(r.url)) return false
      seen.add(r.url)
      return true
    })
    .slice(0, 28)

  if (!deduped.length) return []

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const prompt = `Create blog article briefs for Shana Gates, a real estate agent in the Coachella Valley, CA.
Target month: ${monthName} ${year}.

CITIES SHANA SERVES: Palm Springs, Palm Desert, Rancho Mirage, Indian Wells, La Quinta, Indio, Cathedral City, Desert Hot Springs, Coachella.

SEARCH RESULTS:
${JSON.stringify(deduped)}

INSTRUCTIONS:
Create 5–8 article briefs using these rules:

1. Always include a valley-wide events roundup titled exactly: "What's Happening in the Coachella Valley This ${monthName} ${year}"
2. Always include a free/community events article titled: "Free Events & Farmers Markets in the Coachella Valley: ${monthName} ${year}"
3. If a specific city clearly has 3+ distinct events, create one city-focused article (e.g. "Palm Springs in ${monthName} ${year}: Events, Concerts & Things To Do")
4. Optionally add 1–2 articles around big themes found in results (e.g. music/concerts, food/dining, outdoor/hiking, holiday weekends)
5. EVERY title MUST include "${monthName} ${year}"
6. Each summary must name specific events, venues, dates, or activities pulled from the search results
7. whyItMatters must connect the events to lifestyle value or real estate appeal

Return ONLY a valid JSON array. Each item:
{
  "title": "...",
  "summary": "2-3 sentences naming specific events/details from search results",
  "whyItMatters": "1 sentence connecting to Coachella Valley lifestyle or real estate value",
  "url": "best matching source URL from results",
  "source": "source site name"
}

No markdown fences, no explanation — just the raw JSON array.`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2400,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'

  let briefs: Array<{ title: string; summary: string; whyItMatters: string; url: string; source: string }>
  try {
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    briefs = JSON.parse(clean)
    if (!Array.isArray(briefs)) throw new Error('not array')
  } catch {
    return []
  }

  const prefix = `ev-${year}-${String(month).padStart(2, '0')}`

  return briefs
    .filter((b) => b.title && b.summary)
    .map((b, i): ScoredArticle => ({
      id: `${prefix}-${String(i + 1).padStart(2, '0')}`,
      url: b.url || 'https://visitgreaterpalmsprings.com/events/',
      title: b.title,
      source: b.source || 'Visit Greater Palm Springs',
      publishedDate: new Date().toISOString().split('T')[0],
      summary: b.summary,
      score: 8,
      category: 'local-happenings',
      whyItMatters:
        b.whyItMatters ||
        'Local events showcase the year-round lifestyle that makes Coachella Valley homes so desirable.',
    }))
}
