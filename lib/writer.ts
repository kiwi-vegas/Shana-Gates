import Anthropic from '@anthropic-ai/sdk'
import type { ScoredArticle } from './blog-store'
import type { WeeklyTopic } from './blog-store'
import { detectCity } from './blog-image-gen'
import { autoLinkEntities } from './blog-entity-links'

// ── Shared post structure ─────────────────────────────────────────────────

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

COMPLIANCE — strictly avoid:
- Any mention of school quality, ratings, or test scores
- Any descriptions of safety, "family-friendly," or protected-class language
- Any RESPA-sensitive vendor promotion
- Any fabricated statistics, data, or unverifiable citations — cite real sources or omit
- Any steering, exclusion, or demographic profiling

Return ONLY the blog post in markdown. No metadata, no JSON, no preamble.`

// ── Write from daily article ──────────────────────────────────────────────

export interface BlogPostOutput {
  title: string
  slug: string
  excerpt: string
  body: string
  category: string
  sourceUrl: string
  sourceTitle: string
  pipeline: 'daily' | 'weekly'
  city?: string  // city slug e.g. 'palm-springs'; undefined for general CV posts
}

// Converts detectCity() result to a URL slug, or undefined for general CV posts
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

// ── Write from weekly topic ───────────────────────────────────────────────

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
