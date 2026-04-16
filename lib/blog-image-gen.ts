import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

// ── City detection ────────────────────────────────────────────────────────

const CV_CITY_MAP: Record<string, string> = {
  'palm springs': 'Palm Springs',
  'cathedral city': 'Cathedral City',
  'rancho mirage': 'Rancho Mirage',
  'palm desert': 'Palm Desert',
  'indian wells': 'Indian Wells',
  'la quinta': 'La Quinta',
  'indio': 'Indio',
  'coachella': 'Coachella',
}

/** Returns the specific CV city found in text, or 'Coachella Valley' if none/general. */
export function detectCity(text: string): string {
  const lower = text.toLowerCase()
  // Check compound phrase first to avoid 'coachella' matching 'coachella valley'
  if (lower.includes('coachella valley')) return 'Coachella Valley'
  // Longer keys first to avoid partial matches (e.g. 'indian wells' before 'indian')
  const keys = Object.keys(CV_CITY_MAP).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (lower.includes(key)) return CV_CITY_MAP[key]
  }
  return 'Coachella Valley'
}

// ── Sentiment detection ───────────────────────────────────────────────────

const UP_SIGNALS = [
  'rises', 'rising', 'rose', 'soars', 'soaring', 'surges', 'surging',
  'grows', 'growing', 'growth', 'increases', 'increasing', 'gains', 'gaining',
  'boom', 'booming', 'record high', 'milestone', 'demand', 'hot market',
  'migration', 'moving to', 'influx', 'popular', 'winning', 'tops out',
  'uptick', 'bullish', 'momentum', 'accelerat', 'expands', 'expanding',
  'multiple offers', 'above asking', 'price increase', 'appreciation',
  'upward', 'strong demand', 'rally', 'rebound', 'outpacing',
]

const DOWN_SIGNALS = [
  'falls', 'falling', 'fell', 'drops', 'dropping', 'dropped',
  'declines', 'declining', 'declined', 'decreases', 'decreasing',
  'slowdown', 'slowing', 'cooling', 'cooled', 'cools',
  'fewer buyers', 'shrinks', 'shrinking', 'slumps', 'slumping',
  'correction', 'softens', 'softening', 'soft market',
  'bearish', 'contracts', 'struggles', 'struggling',
  'price cut', 'price reduction', 'longer on market', 'inventory builds',
  'less demand', 'affordability crisis', 'priced out',
]

export type Sentiment = 'up' | 'down' | 'neutral'

/** Returns market direction signal from title + why-it-matters text. */
export function detectSentiment(text: string): Sentiment {
  const lower = text.toLowerCase()
  const upCount = UP_SIGNALS.filter((k) => lower.includes(k)).length
  const downCount = DOWN_SIGNALS.filter((k) => lower.includes(k)).length
  if (upCount > downCount) return 'up'
  if (downCount > upCount) return 'down'
  return 'neutral'
}

// ── City-specific visual anchors ──────────────────────────────────────────

const CITY_VISUAL_ANCHORS: Record<string, string> = {
  'Palm Springs': `
- Aerial drone view of Palm Springs downtown and Palm Canyon Drive with mountain backdrop
- Mid-century modern homes with desert pools and San Jacinto peaks at golden hour
- Palm Springs Aerial Tramway cables ascending the rocky Santa Rosa Mountains
- Classic MCM homes lining quiet palm-shaded streets at golden hour
- Uptown Design District with dramatic mountain silhouette at dusk
`.trim(),

  'Cathedral City': `
- Cathedral City residential neighborhoods framed by Coachella Valley mountain panorama
- Palm-lined streets and desert homes with Santa Rosa Mountains at sunset
- Desert Princess Golf Club aerial with broad mountain backdrop
- Cathedral Canyon Drive looking toward the mountains at dusk
- Wide suburban streetscape with desert mountains and deep blue California sky
`.trim(),

  'Rancho Mirage': `
- Rancho Mirage luxury gated estates with lush fairways and mountain views at golden hour
- Sinatra Drive winding past resort hotels and gated communities at dusk
- Agua Caliente Casino & Resort exterior with dramatic desert sky
- Private luxury estate with infinity pool, mountain backdrop, and manicured desert landscape
- Aerial view of Rancho Mirage resort communities along the valley floor
`.trim(),

  'Palm Desert': `
- El Paseo Shopping District aerial view — palm-lined "Rodeo Drive of the Desert" at dusk
- Palm Desert resort community with championship fairways and San Jacinto Mountain silhouette
- Living Desert Zoo & Gardens entrance with Joshua trees and mountain backdrop
- Upscale condos and resort homes lining Highway 111 under a golden sky
`.trim(),

  'Indian Wells': `
- BNP Paribas Open Tennis Garden aerial — immaculate courts, mountains, brilliant blue sky
- Indian Wells ultra-luxury estate with manicured grounds and twin mountain ranges behind
- Hyatt Regency Indian Wells resort pool and date palms at sunset — pristine, exclusive
- Aerial view of Indian Wells gated communities nestled between Santa Rosa and San Jacinto Mountains
`.trim(),

  'La Quinta': `
- PGA West TPC Stadium Course aerial — championship fairways and dramatic mountain backdrop
- La Quinta Resort & Club buildings amid date palms and mountain backdrop at golden hour
- Old Town La Quinta boutique street scene with mountains framing the view at dusk
- La Quinta Cove hillside homes with dramatic Santa Rosa Mountain cliffs rising above
`.trim(),

  'Indio': `
- Coachella Music Festival grounds aerial view — Empire Polo Club with mountain backdrop
- Indio date palm groves — rows of date trees with mountain backdrop at golden hour
- Empire Polo Club at dusk with stage structures and wide desert sky
- Indio residential neighborhoods with vast Coachella Valley and blue California sky
`.trim(),

  'Coachella': `
- Coachella city aerial view with Salton Sea shimmering in the distance at sunset
- New residential developments in Coachella with desert mountain backdrop
- Agricultural lands and wind turbines near the eastern Coachella Valley at golden hour
- Downtown Coachella streetscape with mountains framing the horizon
`.trim(),

  'Coachella Valley': `
- Sweeping aerial drone view of the entire Coachella Valley with mountain ranges on all sides
- Palm tree-lined boulevard under a deep blue California sky at golden hour
- San Jacinto Mountains framing a valley neighborhood — dramatic scale and grandeur
- Desert sunset with gradient sky from gold to deep blue over the valley floor
- Aerial view of resort communities, golf courses, and highways within the mountain-rimmed valley
`.trim(),
}

// ── Graphic accent: sentiment overrides category ──────────────────────────

const SENTIMENT_ACCENT: Record<'up' | 'down', string> = {
  up: 'a bold upward-pointing arrow in electric blue or teal with a subtle glow — modern, sharp, optimistic',
  down: 'a bold downward-pointing arrow in warm amber/orange — clean and sharp',
}

const CATEGORY_ACCENT: Record<string, string> = {
  'market-update': 'a bold upward-pointing arrow in electric blue, modern and sharp',
  'buying-tips': 'a stylized gold house key or house icon with a subtle sparkle',
  'selling-tips': 'a bold "SOLD" ribbon or gold upward price arrow',
  'community-spotlight': 'a glowing location pin or star icon in bronze/gold',
  'investment': 'a gold coin stack or upward trend chart line in gold',
  'news': 'a small bold accent bar and upward arrow in electric blue',
  'local-area': 'a sun icon or palm tree silhouette in warm gold',
  'market-insight': 'a minimalist upward trend line or bar chart in electric blue',
}

// ── Mapbox city coordinates (for satellite fallback) ──────────────────────

export const CITY_COORDS: Record<string, [number, number, number]> = {
  'Palm Springs':    [-116.5453, 33.8303, 13],
  'Cathedral City':  [-116.4537, 33.7797, 13],
  'Rancho Mirage':   [-116.4158, 33.7395, 13],
  'Palm Desert':     [-116.3743, 33.7225, 13],
  'Indian Wells':    [-116.3415, 33.7170, 13],
  'La Quinta':       [-116.3073, 33.6634, 13],
  'Indio':           [-116.2159, 33.7206, 13],
  'Coachella':       [-116.1728, 33.6803, 13],
  'Coachella Valley':[-116.3443, 33.7500, 10],
}

// ── Build cinematic prompt with Claude ───────────────────────────────────

export async function buildImagePrompt(
  title: string,
  whyItMatters: string,
  category: string,
  body?: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  // Detect city from all available text, sentiment from title + key message
  const searchText = [title, whyItMatters, body ?? ''].join(' ')
  const city = detectCity(searchText)
  const sentiment = detectSentiment(title + ' ' + whyItMatters)

  const cityAnchors = CITY_VISUAL_ANCHORS[city] ?? CITY_VISUAL_ANCHORS['Coachella Valley']
  const accent = sentiment !== 'neutral'
    ? SENTIMENT_ACCENT[sentiment]
    : (CATEGORY_ACCENT[category] ?? 'a bold upward arrow in electric blue')

  // Short overlay text — prepend city name if the article is city-specific
  // and the title doesn't already mention it
  const baseShort = title.length <= 40 ? title : title.split(' ').slice(0, 6).join(' ')
  const shortTitle =
    city !== 'Coachella Valley' && !baseShort.toLowerCase().includes(city.toLowerCase())
      ? `${city}: ${baseShort}`
      : baseShort

  const marketDir =
    sentiment === 'up' ? 'POSITIVE / GROWTH' :
    sentiment === 'down' ? 'NEGATIVE / DECLINING' :
    'NEUTRAL / INFORMATIONAL'

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: `You are building a cinematic news thumbnail for a ${city} real estate article. Style it like a professional YouTube or TV news thumbnail: photorealistic background + bold text overlay + small graphic accent.

Article title: "${title}"
Location: ${city}, California
Overlay text to render in image: "${shortTitle}"
Key message: "${whyItMatters}"
Market direction: ${marketDir}

**Describe all three layers:**

1. BACKGROUND — A specific, recognizable ${city} scene. Must visually place the viewer in ${city}, CA. NEVER use beaches, ocean, tropical scenes, East Coast cities, or any non-${city} location. Cinematic golden hour or dramatic dusk lighting. 4K photorealistic.

${city} visual anchors (choose the most relevant to the article):
${cityAnchors}

2. TEXT OVERLAY — Render the exact text "${shortTitle}" in bold modern sans-serif. White text, subtle dark drop shadow. Upper-left or centered. Large enough to read as a thumbnail. If a city name is present, make it the largest element.

3. GRAPHIC ACCENT — ${accent}. Placed near the title text. Flat/illustrated style, not photorealistic. It must visually reinforce the market direction of the article.

Write a single cohesive 6–9 sentence image generation prompt covering all three layers. Be specific about colors, composition, lighting. Return ONLY the prompt — no preamble, labels, or quotes.`,
      },
    ],
  })

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}

// ── Gemini image generation ───────────────────────────────────────────────

export interface GeneratedImage {
  base64: string
  mimeType: string
  prompt: string
}

export async function generateWithGemini(prompt: string): Promise<GeneratedImage | null> {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-preview-image-generation' })

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt + '\n\nAspect ratio: 16:9. Photorealistic. Render all specified text and graphic elements exactly as described.' }] }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
      } as any,
    })

    const parts = result.response.candidates?.[0]?.content?.parts ?? []
    for (const part of parts) {
      if ((part as any).inlineData) {
        const inline = (part as any).inlineData
        return {
          base64: inline.data,
          mimeType: inline.mimeType ?? 'image/png',
          prompt,
        }
      }
    }
    return null
  } catch {
    return null
  }
}
