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

// ── Build cinematic prompt with Claude ───────────────────────────────────

export async function buildImagePrompt(
  title: string,
  whyItMatters: string,
  category: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const desireLoop = CATEGORY_DESIRE[category] ?? 'evoke aspirational desert living in the Coachella Valley'

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `You are building a cinematic hero image prompt for a real estate blog post.

Blog title: "${title}"
Why it matters: "${whyItMatters}"
Category: ${category}

Use these Coachella Valley visual anchors as your palette:
${VISUAL_ANCHORS}

Desire loop for this category: ${desireLoop}

Write a 5–8 sentence cinematic image prompt that:
1. Stops the scroll (Visual Stun Gun) — choose a Coachella Valley scene that is visually arresting
2. Makes the headline feel more urgent and relevant when the reader sees it
3. Validates the reader's decision to click and read

Return ONLY the image prompt. No preamble, no labels, no quotation marks.`,
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
      contents: [{ role: 'user', parts: [{ text: prompt + '\n\nAspect ratio: 16:9. Photorealistic. No text or watermarks.' }] }],
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
