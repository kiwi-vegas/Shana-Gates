import OpenAI from 'openai'
import { buildImagePrompt, generateWithGemini } from './blog-image-gen'
import { writeClient } from './sanity'

// ── Unsplash fallback pool by category ───────────────────────────────────

const FALLBACK_POOL: Record<string, string[]> = {
  'market-update': [
    'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1792&h=1024&fit=crop',
    'https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=1792&h=1024&fit=crop',
  ],
  'buying-tips': [
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1792&h=1024&fit=crop',
    'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1792&h=1024&fit=crop',
  ],
  'selling-tips': [
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1792&h=1024&fit=crop',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1792&h=1024&fit=crop',
  ],
  'community-spotlight': [
    'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1792&h=1024&fit=crop',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1792&h=1024&fit=crop',
  ],
  'investment': [
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1792&h=1024&fit=crop',
    'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1792&h=1024&fit=crop',
  ],
  'news': [
    'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1792&h=1024&fit=crop',
    'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1792&h=1024&fit=crop',
  ],
  'local-area': [
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1792&h=1024&fit=crop',
    'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=1792&h=1024&fit=crop',
  ],
  'market-insight': [
    'https://images.unsplash.com/photo-1460472178825-e5240623afd5?w=1792&h=1024&fit=crop',
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1792&h=1024&fit=crop',
  ],
}

function deterministicFallback(url: string, category: string): string {
  const pool = FALLBACK_POOL[category] ?? FALLBACK_POOL['news']
  let hash = 0
  for (const c of url) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return pool[hash % pool.length]
}

// ── Upload base64 image to Sanity CDN ─────────────────────────────────────

async function uploadToSanity(base64: string, mimeType: string): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64, 'base64')
    const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png'
    const filename = `shana-blog-cover-${Date.now()}.${ext}`
    const asset = await writeClient.assets.upload('image', buffer, {
      filename,
      contentType: mimeType,
    })
    return asset._id
  } catch {
    return null
  }
}

// ── DALL-E 3 fallback ─────────────────────────────────────────────────────

async function generateWithDallE(prompt: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    if (!process.env.OPENAI_API_KEY) return null
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt + ' Coachella Valley desert real estate. Photorealistic. No text.',
      size: '1792x1024',
      quality: 'hd',
      response_format: 'b64_json',
    })
    const b64 = response.data?.[0]?.b64_json
    if (!b64) return null
    return { base64: b64, mimeType: 'image/png' }
  } catch {
    return null
  }
}

// ── Scrape OG image from source URL ──────────────────────────────────────

async function scrapeOgImage(url: string): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const html = await res.text()
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    return match ? match[1] : null
  } catch {
    return null
  }
}

// ── Unsplash API ──────────────────────────────────────────────────────────

async function fetchUnsplash(category: string): Promise<string | null> {
  if (!process.env.UNSPLASH_ACCESS_KEY) return null
  const queries: Record<string, string> = {
    'market-update': 'palm springs desert real estate',
    'buying-tips': 'desert home purchase keys',
    'selling-tips': 'luxury desert home sale',
    'community-spotlight': 'coachella valley palm springs',
    'investment': 'palm springs vacation rental pool',
    'news': 'california real estate',
    'local-area': 'palm springs desert lifestyle',
    'market-insight': 'real estate data analysis',
  }
  const q = encodeURIComponent(queries[category] ?? 'palm springs desert')
  try {
    const res = await fetch(
      `https://api.unsplash.com/photos/random?query=${q}&orientation=landscape&client_id=${process.env.UNSPLASH_ACCESS_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    )
    const data = await res.json()
    return data?.urls?.regular ?? null
  } catch {
    return null
  }
}

// ── Main orchestrator ─────────────────────────────────────────────────────

export interface HeroImageResult {
  sanityAssetId: string | null  // null means use externalUrl
  externalUrl: string | null
}

export async function generateHeroImage(
  title: string,
  whyItMatters: string,
  category: string,
  sourceUrl: string
): Promise<HeroImageResult> {
  // Step 1: Build cinematic prompt
  const prompt = await buildImagePrompt(title, whyItMatters, category).catch(
    () => `Cinematic Coachella Valley desert real estate scene, photorealistic, 16:9`
  )

  // Step 2: Try Gemini
  const geminiResult = await generateWithGemini(prompt)
  if (geminiResult) {
    const assetId = await uploadToSanity(geminiResult.base64, geminiResult.mimeType)
    if (assetId) return { sanityAssetId: assetId, externalUrl: null }
  }

  // Step 3: Try DALL-E 3
  const dalleResult = await generateWithDallE(prompt)
  if (dalleResult) {
    const assetId = await uploadToSanity(dalleResult.base64, dalleResult.mimeType)
    if (assetId) return { sanityAssetId: assetId, externalUrl: null }
  }

  // Step 4: Try OG image from source
  const ogUrl = await scrapeOgImage(sourceUrl)
  if (ogUrl) return { sanityAssetId: null, externalUrl: ogUrl }

  // Step 5: Try Unsplash API
  const unsplashUrl = await fetchUnsplash(category)
  if (unsplashUrl) return { sanityAssetId: null, externalUrl: unsplashUrl }

  // Step 6: Deterministic fallback pool
  return { sanityAssetId: null, externalUrl: deterministicFallback(sourceUrl || title, category) }
}
