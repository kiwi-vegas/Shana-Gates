import Anthropic from '@anthropic-ai/sdk'

interface EntityLink {
  entity: string
  url: string
}

export async function autoLinkEntities(body: string): Promise<string> {
  if (!body || body.length < 100) return body

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `This is a Coachella Valley real estate blog post. Identify named entities that have well-known, widely-recognized official public websites: major festivals, parks, sports venues, museums, or specific named businesses.

Return ONLY a JSON array — no explanation, no markdown fences:
[{"entity":"Coachella Music Festival","url":"https://www.coachella.com"},{"entity":"BNP Paribas Open","url":"https://bnpparibasopen.com"}]

CRITICAL — URL accuracy:
- ONLY include a URL if you are 100% certain it is the correct, currently-live official site. If you would even hesitate, OMIT the entity entirely.
- Prefer well-known commercial/event domains (coachella.com, stagecoachfestival.com, bnpparibasopen.com, modernismweek.com, mccallumtheatre.org, psmuseum.org, nps.gov/jotr).
- DO NOT GUESS county or local government URLs. They have inconsistent naming (e.g., riversidecountyassessor.org does NOT exist; the real domain is rivcoacr.org). When in doubt, OMIT.
- Avoid: school district URLs, county clerk URLs, county tax URLs, niche local business URLs unless you are certain.

Other rules:
- Only entities EXPLICITLY named in the text (use exact capitalization from the text)
- Max 10 entities (fewer is better than wrong)
- EXCLUDE: Shana Gates, Craft & Bauer, Real Broker, Claude, Anthropic, YLOPO, Vercel
- EXCLUDE vague references like "local restaurants", "the county", "the city assessor"
- INCLUDE: nationally-known festivals, named national/state parks (Joshua Tree National Park, Indian Canyons), nationally-known cultural venues (Palm Springs Art Museum, McCallum Theatre)

Blog post:
${body.slice(0, 3500)}`,
    }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\[[\s\S]*?\]/)
  if (!jsonMatch) return body

  let entities: EntityLink[]
  try {
    entities = JSON.parse(jsonMatch[0])
    if (!Array.isArray(entities)) return body
  } catch {
    return body
  }

  // Sort longest name first to prevent partial-match collisions
  entities.sort((a, b) => b.entity.length - a.entity.length)

  let result = body
  for (const { entity, url } of entities) {
    if (!entity?.trim() || !url?.startsWith('http')) continue
    if (result.includes(`](${url})`)) continue // already linked
    result = linkFirstOccurrence(result, entity, url)
  }

  return result
}

function linkFirstOccurrence(text: string, entity: string, url: string): string {
  // Split on existing Markdown links to avoid modifying text inside [label](url)
  const parts = text.split(/(\[.*?\]\([^)]*\))/g)
  let linked = false
  const escaped = entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(escaped, 'i')

  return parts
    .map((part) => {
      if (/^\[.*?\]\([^)]*\)$/.test(part)) return part // leave existing links alone
      if (linked) return part
      return part.replace(re, (match) => {
        linked = true
        return `[${match}](${url})`
      })
    })
    .join('')
}
