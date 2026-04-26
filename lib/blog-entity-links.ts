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
      content: `This is a Coachella Valley real estate blog post. Identify named entities that have well-known official public websites: major festivals, events, parks, organizations, government agencies, sports venues, schools, museums, or specific named businesses.

Return ONLY a JSON array — no explanation, no markdown fences:
[{"entity":"Coachella Music Festival","url":"https://www.coachella.com"},{"entity":"BNP Paribas Open","url":"https://bnpparibasopen.com"}]

Rules:
- Only entities EXPLICITLY named in the text (use exact capitalization from the text)
- Only URLs you are highly confident are correct and stable (official websites, not Wikipedia)
- Max 12 entities
- EXCLUDE: Shana Gates, Craft & Bauer, Real Broker, Claude, Anthropic, YLOPO, Vercel
- EXCLUDE vague references like "local restaurants", "the city", "nearby businesses"
- INCLUDE: specific named festivals (Coachella, Stagecoach, BNP Paribas Open, Modernism Week), city governments (City of Palm Springs), named parks (Joshua Tree National Park, Indian Canyons), named schools, named cultural venues (Palm Springs Art Museum, McCallum Theatre)

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
