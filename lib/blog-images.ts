import OpenAI from 'openai'
import { buildImagePrompt, generateWithGemini, detectCity, CITY_COORDS } from './blog-image-gen'
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

function deterministicFallback(key: string, category: string): string {
  const pool = FALLBACK_POOL[category] ?? FALLBACK_POOL['news']
  let hash = 0
  for (const c of key) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
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
      prompt: prompt + ' Coachella Valley desert real estate. Photorealistic. Render all specified text and graphic elements.',
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

// ── Mapbox satellite fallback ─────────────────────────────────────────────
// Returns a satellite-streets map image URL for the detected city.
// Uses the public pk. token already embedded in the community pages.

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN ??
  'pk.eyJ1IjoidmVnYXMta2l3aSIsImEiOiJjbW8waXJoaWEwOHN2MnJxYTl2bWNlaGp0In0.C57V2IUuHiNKHn5LLlbXog'

function buildMapboxUrl(city: string): string {
  const coords = CITY_COORDS[city] ?? CITY_COORDS['Coachella Valley']
  const [lon, lat, zoom] = coords
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${lon},${lat},${zoom},0/1280x720?access_token=${MAPBOX_TOKEN}`
}

// ── Unsplash API ──────────────────────────────────────────────────────────

async function fetchUnsplash(category: string, city: string): Promise<string | null> {
  if (!process.env.UNSPLASH_ACCESS_KEY) return null
  const cityQ = city !== 'Coachella Valley' ? city : 'coachella valley palm springs'
  const queries: Record<string, string> = {
    'market-update': `${cityQ} real estate`,
    'buying-tips': `${cityQ} desert home`,
    'selling-tips': `${cityQ} luxury home sale`,
    'community-spotlight': cityQ,
    'investment': `${cityQ} vacation rental pool`,
    'news': `${cityQ} california real estate`,
    'local-area': `${cityQ} desert lifestyle`,
    'market-insight': `${cityQ} real estate`,
  }
  const q = encodeURIComponent(queries[category] ?? `${cityQ} desert`)
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

async function tryAiImageGeneration(
  title: string,
  whyItMatters: string,
  category: string,
  sourceUrl: string,
  body: string
): Promise<HeroImageResult | null> {
  try {
    const prompt = await buildImagePrompt(title, whyItMatters, category, body).catch(
      () => `Cinematic Coachella Valley desert real estate scene, photorealistic, 16:9`
    )

    // Try Gemini — no timeout, let it run to completion
    const geminiResult = await generateWithGemini(prompt)
    if (geminiResult) {
      const assetId = await uploadToSanity(geminiResult.base64, geminiResult.mimeType)
      if (assetId) return { sanityAssetId: assetId, externalUrl: null }
    }

    // Try DALL-E 3
    const dalleResult = await generateWithDallE(prompt)
    if (dalleResult) {
      const assetId = await uploadToSanity(dalleResult.base64, dalleResult.mimeType)
      if (assetId) return { sanityAssetId: assetId, externalUrl: null }
    }

    // Try OG scrape from source article
    const ogUrl = await scrapeOgImage(sourceUrl)
    if (ogUrl) return { sanityAssetId: null, externalUrl: ogUrl }

    return null
  } catch {
    return null
  }
}

export async function generateHeroImage(
  title: string,
  whyItMatters: string,
  category: string,
  sourceUrl: string,
  body = ''
): Promise<HeroImageResult> {
  // Detect city for location-aware fallbacks
  const searchText = [title, whyItMatters, body].join(' ')
  const city = detectCity(searchText)

  // Attempt AI generation with a 20-second cap
  const aiResult = await tryAiImageGeneration(title, whyItMatters, category, sourceUrl, body)
  if (aiResult) return aiResult

  // Mapbox satellite fallback — geographically accurate to the detected city
  const mapboxUrl = buildMapboxUrl(city)
  return { sanityAssetId: null, externalUrl: mapboxUrl }

  // (Unsplash + pool remain available if Mapbox token is revoked — swap return above)
}
