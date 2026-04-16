import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

// ── Visual anchors for Coachella Valley ───────────────────────────────────

const VISUAL_ANCHORS = `
- Palm Springs hillside homes at golden hour — warmth, luxury, aspiration
- Palm tree-lined streets under a deep blue California sky — iconic desert lifestyle
- San Jacinto Mountains framing a valley neighborhood — scale, natural grandeur
- Mid-century modern architecture with a sparkling pool — style, heritage, investment appeal
- Desert sunset with dramatic gradient sky — aspirational, escapism
- Luxury backyard pool with mountain backdrop — high-end resort living
- Golf course fairway with mountain views — affluence, lifestyle
- Aerial view of the Coachella Valley surrounded by mountains — unique geography, scale
- Joshua trees and desert flora at dawn — natural Californian character
`.trim()

// Category desire loops
const CATEGORY_DESIRE: Record<string, string> = {
  'market-update': 'evoke economic momentum, growth, optimism about the desert real estate market',
  'buying-tips': 'evoke discovery, anticipation, the thrill of finding your dream desert home',
  'selling-tips': 'evoke confidence, expertise, the satisfaction of a successful sale',
  'community-spotlight': 'evoke pride of place, belonging, the unique beauty of this specific community',
  'investment': 'evoke wealth, opportunity, the strategic wisdom of desert property investment',
  'news': 'evoke informed awareness, stability, trust in expert guidance',
  'local-area': 'evoke the joy of desert living, lifestyle, sun and warmth',
  'market-insight': 'evoke clarity, expert analysis, data-driven confidence',
}

// Graphic accent suggestions per category
const CATEGORY_ACCENT: Record<string, string> = {
  'market-update': 'a bold upward-pointing arrow in electric blue or teal, modern and sharp',
  'buying-tips': 'a stylized gold house key or house icon with a subtle sparkle effect',
  'selling-tips': 'a bold "SOLD" ribbon or upward price arrow in gold',
  'community-spotlight': 'a glowing location pin or star icon in bronze/gold',
  'investment': 'a gold coin stack or upward trend chart line in gold',
  'news': 'a small bold upward arrow or breaking-news accent bar in blue',
  'local-area': 'a sun icon or palm tree silhouette in warm gold',
  'market-insight': 'a minimalist upward trend line or bar chart in electric blue',
}

// ── Build cinematic prompt with Claude ───────────────────────────────────

export async function buildImagePrompt(
  title: string,
  whyItMatters: string,
  category: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const desireLoop = CATEGORY_DESIRE[category] ?? 'evoke aspirational desert living in the Coachella Valley'
  const accent = CATEGORY_ACCENT[category] ?? 'a bold upward arrow in electric blue'

  // Derive a short punchy text overlay from the title (3–6 words)
  const shortTitle = title.length <= 40 ? title : title.split(' ').slice(0, 6).join(' ')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: `You are building a cinematic blog thumbnail prompt for a Coachella Valley real estate article. The final image should look like a professional TV news thumbnail: a stunning photorealistic background with bold text and a small graphic accent composited on top — exactly like a Fox Business or Bloomberg real estate segment thumbnail.

Article title: "${title}"
Short overlay text to render in the image: "${shortTitle}"
Key message: "${whyItMatters}"
Category: ${category}

**Required image structure — describe all three layers in your prompt:**

1. BACKGROUND: A specific, recognizable Coachella Valley or Palm Springs, CA aerial or eye-level scene. Use cinematic golden hour or dramatic blue-hour lighting. 4K quality, photorealistic. LOCATION MUST BE Coachella Valley / Palm Springs, CA. NEVER use: beaches, ocean, tropical scenes, East Coast cities, or any non-California desert location.

Coachella Valley visual anchors (choose the most relevant to the article topic):
${VISUAL_ANCHORS}

2. TEXT OVERLAY: The text "${shortTitle}" rendered in bold, modern sans-serif font — white text with a subtle dark drop shadow for readability. Place it in the upper-left or center of the image, large enough to read at thumbnail size. If a location name is in the title, make it especially prominent.

3. GRAPHIC ACCENT: ${accent}. Place it near the text — small enough to be an accent, bold enough to catch the eye. This is a flat/illustrated graphic element, not a photorealistic object.

Desire loop: ${desireLoop}

Write a single cohesive image generation prompt (6–9 sentences) that fully describes the background scene, text placement and styling, and graphic accent placement. Be specific. Return ONLY the prompt — no preamble, no labels, no quotes.`,
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

    // Try gemini-2.0-flash-preview-image-generation (available model)
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
