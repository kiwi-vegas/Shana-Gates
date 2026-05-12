import Anthropic from '@anthropic-ai/sdk'
import type { ScoredArticle, WeeklyTopic } from './blog-store'
import type { IdeaCandidate, BlogPostDraft, PortableTextBlock, PortableTextSpan } from './types'
import { detectCity } from './blog-image-gen'
import { autoLinkEntities } from './blog-entity-links'
import { FAIR_HOUSING_RULES } from './fair-housing'

// ── Shared post structure ─────────────────────────────────────────────────────

const WRITER_SYSTEM = `You are writing blog posts for Shana Gates, REALTOR® at Craft & Bauer | Real Broker — a respected Coachella Valley real estate professional.

VOICE:
- Write as Shana Gates (first person occasionally, but mostly "you/your" to speak to the reader)
- Knowledgeable and approachable, never salesy
- Second-person ("you/your") to make the message personal and actionable
- Always ties news or advice back to the local Coachella Valley / Palm Springs market

POST STRUCTURE (follow exactly):
1. # [Engaging headline — rewrite the source title to be more compelling]
2. [Opening question — the exact question the blog answers, in **bold**]
3. [1–2 sentence "snippet answer" immediately below the question]
4. ## [Section heading]
   [2–3 paragraphs per section]
5. ## [Section heading]
6. ## What This Means For You
   - [Bullet 1]
   - [Bullet 2]
   - [Bullet 3]
   - [Bullet 4]
7. [Closing paragraph — ties it together, actionable takeaway]
8. *Ready to make your move in the Coachella Valley? Reach out to Shana Gates at Craft & Bauer — she knows this market inside and out. [Contact Shana →](mailto:shana@craftbauer.com)*

${FAIR_HOUSING_RULES}

Return ONLY the blog post in markdown. No metadata, no JSON, no preamble.`

// ── Shared types for blog picker output ──────────────────────────────────────

export interface BlogPostOutput {
  title: string
  slug: string
  excerpt: string
  body: string
  category: string
  sourceUrl: string
  sourceTitle: string
  pipeline: 'daily' | 'weekly'
  city?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cityToSlug(cityName: string): string | undefined {
  if (!cityName || cityName === 'Coachella Valley') return undefined
  return cityName.toLowerCase().replace(/\s+/g, '-')
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    + `-${Date.now()}`
}

function extractExcerpt(body: string, maxLen = 200): string {
  const lines = body.split('\n').filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('*'))
  const text = lines[0] ?? ''
  return text.slice(0, maxLen).trim()
}

function extractTitle(body: string, fallback: string): string {
  const match = body.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : fallback
}

// ── Write from daily article (blog picker flow) ───────────────────────────────

export async function writeFromArticle(article: ScoredArticle): Promise<BlogPostOutput> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const prompt = `Write a complete blog post for Shana Gates based on this article:

Title: ${article.title}
Source: ${article.source}
URL: ${article.url}
Summary: ${article.summary}
Why It Matters: ${article.whyItMatters}
Category: ${article.category}

Write the full blog post now. Make it 600–800 words. Follow the post structure exactly.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: WRITER_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const body = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const title = extractTitle(body, article.title)
  const excerpt = extractExcerpt(body)
  const city = cityToSlug(detectCity(title + ' ' + article.title + ' ' + article.summary + ' ' + (article.whyItMatters || '')))
  const enrichedBody = await autoLinkEntities(body).catch(() => body)

  return {
    title,
    slug: slugify(title),
    excerpt,
    body: enrichedBody,
    category: article.category,
    sourceUrl: article.url,
    sourceTitle: article.title,
    pipeline: 'daily',
    city,
  }
}

// ── Write from weekly topic (blog picker flow) ────────────────────────────────

export async function writeFromTopic(topic: WeeklyTopic): Promise<BlogPostOutput> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const prompt = `Write a complete blog post for Shana Gates based on this topic:

Title: ${topic.title}
Category: ${topic.category}
Angle: ${topic.angle}
Research Context: ${topic.researchContext}
Target Keywords: ${topic.keywords.join(', ')}

Write the full blog post now. Make it 700–900 words. Follow the post structure exactly.
Use the target keywords naturally in the title, first paragraph, subheadings, and closing.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    system: WRITER_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const body = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const title = extractTitle(body, topic.title)
  const excerpt = extractExcerpt(body)
  const city = cityToSlug(detectCity(title + ' ' + topic.title + ' ' + (topic.angle || '') + ' ' + (topic.researchContext || '')))
  const enrichedBody = await autoLinkEntities(body).catch(() => body)

  return {
    title,
    slug: slugify(title),
    excerpt,
    body: enrichedBody,
    category: topic.category,
    sourceUrl: '',
    sourceTitle: '',
    pipeline: 'weekly',
    city,
  }
}

// ── Portable text helpers (for idea pipeline) ─────────────────────────────────

const SELLER_URL = 'https://shanasells.com'

function makeKey(): string {
  return Math.random().toString(36).slice(2, 10)
}

function lineToBlock(line: string): PortableTextBlock {
  const trimmed = line.trim()
  let style: PortableTextBlock['style'] = 'normal'
  let content = trimmed

  if (trimmed.startsWith('## '))       { style = 'h2';         content = trimmed.slice(3) }
  else if (trimmed.startsWith('### ')) { style = 'h3';         content = trimmed.slice(4) }
  else if (trimmed.startsWith('> '))   { style = 'blockquote'; content = trimmed.slice(2) }

  if (style !== 'normal') {
    return {
      _type: 'block', _key: makeKey(), style, markDefs: [],
      children: [{ _type: 'span', _key: makeKey(), text: content, marks: [] }],
    }
  }

  const expanded = content.replace(/\[SELLER_CTA:\s*([^\]]+)\]/g, (_, t) => `[${t.trim()}](${SELLER_URL})`)
  const mdLinks = [...expanded.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)]

  if (mdLinks.length === 0) {
    return {
      _type: 'block', _key: makeKey(), style: 'normal', markDefs: [],
      children: [{ _type: 'span', _key: makeKey(), text: content, marks: [] }],
    }
  }

  const markDefs: Array<{ _type: 'link'; _key: string; href: string }> = []
  const children: PortableTextSpan[] = []
  let cursor = 0

  for (const m of mdLinks) {
    const before = expanded.slice(cursor, m.index!)
    if (before) children.push({ _type: 'span', _key: makeKey(), text: before, marks: [] })
    const linkKey = makeKey()
    markDefs.push({ _type: 'link', _key: linkKey, href: m[2] })
    children.push({ _type: 'span', _key: makeKey(), text: m[1], marks: [linkKey] })
    cursor = m.index! + m[0].length
  }
  const tail = expanded.slice(cursor)
  if (tail) children.push({ _type: 'span', _key: makeKey(), text: tail, marks: [] })

  return { _type: 'block', _key: makeKey(), style: 'normal', markDefs, children }
}

function bodyTextToBlocks(bodyText: string): PortableTextBlock[] {
  const blocks: PortableTextBlock[] = []
  for (const line of bodyText.split('\n').filter((l) => l.trim())) {
    const trimmed = line.trim()
    if (trimmed.startsWith('- ')) {
      blocks.push(lineToBlock('• ' + trimmed.slice(2)))
    } else {
      blocks.push(lineToBlock(trimmed))
    }
  }
  return blocks
}

// ── Write from IdeaCandidate (idea pipeline flow) ─────────────────────────────

export async function writePostFromIdea(
  idea: IdeaCandidate,
  learningsContext: string,
): Promise<BlogPostDraft> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const cityFocus = idea.cityTarget ?? 'Coachella Valley'
  const keyword   = idea.targetKeyword ?? idea.title

  const researchSection = idea.researchData
    ? `\nRESEARCH / SOURCE MATERIAL:\n${idea.researchData.slice(0, 5000)}`
    : ''

  const slugifySimple = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim().slice(0, 96)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    messages: [{
      role: 'user',
      content: `You are Shana Gates, writing for the Shana Gates Real Estate blog. You are an experienced Coachella Valley REALTOR® at Craft & Bauer | Real Broker. You write to genuinely inform local buyers, sellers, homeowners, and investors — not to sell, but to help them make smarter decisions.

POST BRIEF:
- Title/Angle: ${idea.title}
- Editorial framing: ${idea.angle}
- Why it matters to Coachella Valley residents: ${idea.whyItMatters}
- Category: ${idea.category}
- Content type: ${idea.contentType}
- Primary city focus: ${cityFocus}
- Target keyword: ${keyword}
- Primary audiences: ${idea.audiences.join(', ')}

BLOG LEARNINGS & STYLE GUIDE:
${learningsContext.slice(0, 4000)}
${researchSection}

${FAIR_HOUSING_RULES}

WRITING RULES:
- Voice: knowledgeable, warm, direct. Feels like advice from a trusted neighbor who knows the market cold.
- Open with 1–2 sentences that directly answer the reader's most likely question — short, factual, CV-specific. This is the featured snippet hook.
- Always tie insights back to what they mean for Coachella Valley buyers/sellers/homeowners specifically
- Structure: intro (with direct answer) → 2–3 body sections with ## headings → ## What This Means For You (3–4 bullet points) → brief closing → ## Frequently Asked Questions
- 500–700 words total
- Avoid: salesy language, generic "tips", excessive CTAs

SEO RULES:
1. Target keyword is: ${keyword} — use it naturally in the opening paragraph, in at least one ## heading, and 2–3 times in the body.
2. End with ## Frequently Asked Questions — exactly 3 questions as ### headings, each with a 2–3 sentence answer.
3. Add 1 internal link where it genuinely helps the reader. Use markdown link syntax.
4. COMMUNITY LINK RULE: On the FIRST mention of any CV city by name, format as a markdown link: [Palm Springs](/palm-springs.html), [Palm Desert](/palm-desert.html), [Rancho Mirage](/rancho-mirage.html), [Indian Wells](/indian-wells.html), [La Quinta](/la-quinta.html), [Indio](/indio.html), [Cathedral City](/cathedral-city.html), [Desert Hot Springs](/desert-hot-springs.html), [Coachella](/coachella.html). Only the first mention of each.

Return a JSON object with EXACTLY these fields:
{
  "title": "Final polished headline (optimize for keyword: ${keyword})",
  "slug": "url-slug",
  "excerpt": "2–3 sentence summary for blog listing page",
  "metaTitle": "SEO title under 60 chars",
  "metaDescription": "SEO description 120–160 chars",
  "body": "Full post in plain text. Use ## for h2, ### for h3, - for bullets. Must include FAQ section at end."
}

Return ONLY valid JSON, no markdown fences.`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'

  let raw: Record<string, string>
  try {
    raw = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*"title"\s*:\s*"([^"]+)"/)
    if (!match) throw new Error(`Failed to parse post JSON (stop_reason: ${response.stop_reason}). Try approving again.`)
    throw new Error(`Post generation was cut off mid-response (stop_reason: ${response.stop_reason}). Try again.`)
  }

  const blocks = bodyTextToBlocks(raw.body ?? '')

  // Append source credit if we have a source URL
  if (idea.sourceUrls.length > 0) {
    const sourceUrl = idea.sourceUrls[0]
    const sourceName = idea.sourceDomains[0] ?? sourceUrl
    const linkKey = makeKey()
    blocks.push({
      _type: 'block', _key: makeKey(), style: 'normal',
      markDefs: [{ _type: 'link', _key: linkKey, href: sourceUrl }],
      children: [{ _type: 'span', _key: makeKey(), text: `Source: ${sourceName}`, marks: [linkKey] }],
    })
  }

  return {
    title:           raw.title ?? idea.title,
    slug:            raw.slug  ?? slugifySimple(raw.title ?? idea.title),
    excerpt:         raw.excerpt ?? '',
    category:        idea.category,
    metaTitle:       raw.metaTitle ?? '',
    metaDescription: raw.metaDescription ?? '',
    body:            blocks,
    sourceUrl:       idea.sourceUrls[0] ?? '',
    sourceTitle:     idea.title,
  }
}
