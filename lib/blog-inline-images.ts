import Anthropic from '@anthropic-ai/sdk'

// ── Types ─────────────────────────────────────────────────────────────────

export interface UnsplashPhoto {
  id: string
  thumbUrl: string
  regularUrl: string
  authorName: string
  authorUrl: string
  source?: 'unsplash' | 'pexels'
}

export interface ImagePlacement {
  sectionIndex: number
  concept: string
  altText: string
  searchQuery: string
}

export interface ImageSuggestion {
  itemId: string
  title: string
  placements: (ImagePlacement & { photos: UnsplashPhoto[] })[]
}

export interface ApprovedSelection {
  sectionIndex: number
  altText: string
  photo: Pick<UnsplashPhoto, 'regularUrl' | 'authorName' | 'authorUrl' | 'source'> & {
    /** Base64 JPEG data URL — only present for user-uploaded photos before server processing */
    dataUrl?: string
  }
}

// ── Coachella Valley expert system prompt ─────────────────────────────────
// This persona knows every landmark, venue, and visual character of the valley.
// It generates hyper-specific search queries — exact place names, not generic terms.

const CV_EXPERT_SYSTEM = `You are a lifelong Coachella Valley resident, real estate blogger, and REALTOR® who has personally sold thousands of homes across Palm Springs, Cathedral City, Rancho Mirage, Palm Desert, Indian Wells, La Quinta, Indio, Desert Hot Springs, and Coachella.

You know every landmark, venue, neighborhood, and visual character of this valley — PGA West's Stadium Course in La Quinta, the Empire Polo Club in Indio where Coachella Festival happens, the BNP Paribas Tennis Garden in Indian Wells, El Paseo shopping in Palm Desert, Agua Caliente Casino in Rancho Mirage, the Aerial Tramway ascending San Jacinto in Palm Springs, date palm agricultural groves in Indio, La Quinta Cove hillside homes against the Santa Rosa Mountains.

SEARCH QUERY RULES — follow these exactly:
- ALWAYS include a specific place name (city, venue, landmark, or neighborhood) in the query
- Unsplash and Pexels DO have excellent Palm Springs, California desert, and Coachella Valley photos — being specific finds them
- Never use generic terms alone; always anchor with a location or landmark name

GOOD QUERIES — use as models:
✓ "Palm Springs mid-century modern architecture pool"
✓ "PGA West golf course La Quinta California"
✓ "Coachella Festival Empire Polo Club Indio"
✓ "Indian Wells Tennis Garden BNP Paribas stadium"
✓ "El Paseo Palm Desert shopping district"
✓ "La Quinta cove hillside homes Santa Rosa Mountains"
✓ "Palm Springs Aerial Tramway San Jacinto Mountain"
✓ "date palm grove Indio Coachella Valley"
✓ "Rancho Mirage luxury estate pool golf resort"
✓ "Coachella Valley aerial view mountains desert"
✓ "Palm Desert Living Desert cactus gardens"
✓ "Palm Springs downtown Palm Canyon Drive"
✓ "Indian Wells luxury estate desert mountain view"
✓ "La Quinta Resort golf course palm trees"
✓ "Palm Springs pool sunset San Jacinto Mountains"
✓ "desert hot springs spa mineral pool"
✓ "Salton Sea Coachella Valley California"
✓ "Cathedral City desert neighborhood mountain view"

BAD QUERIES — never write these:
✗ "desert real estate" (too generic)
✗ "golf course" (use the specific course name + location)
✗ "music festival" (use "Coachella Festival Empire Polo Club")
✗ "luxury home pool" (use "Palm Springs" or "Indian Wells" + specific style)
✗ "desert landscape" (add a city name)
✗ "California shopping" (use "El Paseo Palm Desert" or "Palm Springs downtown")

Return ONLY valid JSON — no markdown fences, no explanations, no code blocks. Return exactly 2 placements as a JSON array.`

// ── Claude: extract image placements from article context ─────────────────

export async function extractImagePlacements(
  title: string,
  contentContext: string,
  category: string
): Promise<ImagePlacement[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: CV_EXPERT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Blog post title: "${title}"
Category: ${category}
Content: ${contentContext}

Identify exactly 2 sections in this blog post where an inline photo would make the reader pause, feel the place, or understand the content better. Use your deep Coachella Valley knowledge — pick images that are SPECIFIC to what this article is actually about (the exact city, venue, or landmark mentioned).

Return a JSON array of exactly 2 objects:
[
  {
    "sectionIndex": 0,
    "concept": "one sentence describing the ideal photo using specific CV landmarks/locations",
    "searchQuery": "hyper-specific 4-6 word Unsplash/Pexels query with exact place names",
    "altText": "10-15 word descriptive alt text for the image"
  },
  {
    "sectionIndex": 1,
    "concept": "...",
    "searchQuery": "...",
    "altText": "..."
  }
]`,
      },
    ],
  })

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
    // Strip accidental markdown fences
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/\n?```$/i, '')

  try {
    const parsed = JSON.parse(raw)
    return (Array.isArray(parsed) ? parsed : []).slice(0, 2)
  } catch {
    // Fallback: safe default placements
    return [
      {
        sectionIndex: 0,
        concept: 'Palm Springs mid-century modern home with desert pool',
        searchQuery: 'Palm Springs mid-century modern architecture pool',
        altText: 'Mid-century modern home with pool in Palm Springs, California',
      },
      {
        sectionIndex: 1,
        concept: 'Coachella Valley aerial view with mountain backdrop',
        searchQuery: 'Coachella Valley aerial view mountains desert California',
        altText: 'Aerial view of the Coachella Valley surrounded by mountains',
      },
    ]
  }
}

// ── Unsplash: search for photos ───────────────────────────────────────────

export async function searchUnsplash(query: string, count = 3): Promise<UnsplashPhoto[]> {
  if (!process.env.UNSPLASH_ACCESS_KEY) return []
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape&content_filter=high`,
      {
        headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map((p: any) => ({
      id: p.id,
      thumbUrl: p.urls?.small ?? '',
      regularUrl: p.urls?.regular ?? '',
      authorName: p.user?.name ?? 'Unknown',
      authorUrl: p.user?.links?.html ?? 'https://unsplash.com',
      source: 'unsplash' as const,
    }))
  } catch {
    return []
  }
}

// ── Pexels: search for photos ─────────────────────────────────────────────

export async function searchPexels(query: string, count = 3): Promise<UnsplashPhoto[]> {
  if (!process.env.PEXELS_API_KEY) return []
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
      {
        headers: { Authorization: process.env.PEXELS_API_KEY },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.photos ?? []).map((p: any) => ({
      id: `pexels-${p.id}`,
      thumbUrl: p.src?.medium ?? '',
      regularUrl: p.src?.large ?? '',
      authorName: p.photographer ?? 'Unknown',
      authorUrl: p.photographer_url ?? 'https://www.pexels.com',
      source: 'pexels' as const,
    }))
  } catch {
    return []
  }
}

// ── Interleave results from two sources ──────────────────────────────────
// Returns [U1, P1, U2, P2, U3, P3] so both sources appear in the picker.

function interleave(a: UnsplashPhoto[], b: UnsplashPhoto[]): UnsplashPhoto[] {
  const result: UnsplashPhoto[] = []
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    if (i < a.length) result.push(a[i])
    if (i < b.length) result.push(b[i])
  }
  return result
}

// ── Orchestrate: suggestions for multiple items ───────────────────────────

export async function getSuggestionsForItems(
  items: { id: string; title: string; contentContext: string; category: string }[]
): Promise<ImageSuggestion[]> {
  return Promise.all(
    items.map(async (item) => {
      const placements = await extractImagePlacements(item.title, item.contentContext, item.category)

      const placementsWithPhotos = await Promise.all(
        placements.map(async (placement) => {
          const [unsplashPhotos, pexelsPhotos] = await Promise.all([
            searchUnsplash(placement.searchQuery, 3),
            searchPexels(placement.searchQuery, 3),
          ])
          return {
            ...placement,
            photos: interleave(unsplashPhotos, pexelsPhotos), // up to 6 photos per placement
          }
        })
      )

      return {
        itemId: item.id,
        title: item.title,
        placements: placementsWithPhotos,
      }
    })
  )
}

// ── Build attribution markdown ────────────────────────────────────────────

export function buildImageMarkdown(
  photo: Pick<UnsplashPhoto, 'regularUrl' | 'authorName' | 'authorUrl'> & { source?: string },
  altText: string
): string {
  // User-uploaded photos: no third-party attribution needed
  if (photo.source === 'upload') {
    return `![${altText}](${photo.regularUrl})`
  }
  const isPexels = photo.source === 'pexels' || photo.authorUrl?.includes('pexels.com')
  const platform = isPexels ? 'Pexels' : 'Unsplash'
  const platformUrl = isPexels ? 'https://www.pexels.com' : 'https://unsplash.com'
  return `![${altText}](${photo.regularUrl})\n*Photo by [${photo.authorName}](${photo.authorUrl}) on [${platform}](${platformUrl})*`
}

// ── Inject approved images into post body ─────────────────────────────────

export function injectImagesIntoBody(body: string, selections: ApprovedSelection[]): string {
  if (!selections.length) return body

  const lines = body.split('\n')

  // Collect all ## heading line indices
  const headingLines: number[] = []
  lines.forEach((line, i) => {
    if (/^## /.test(line)) headingLines.push(i)
  })

  // Sort descending so later insertions don't shift earlier indices
  const sorted = [...selections].sort((a, b) => b.sectionIndex - a.sectionIndex)

  for (const sel of sorted) {
    const headingLineIdx = headingLines[sel.sectionIndex]
    if (headingLineIdx === undefined) continue

    // Insert at end of this section — just before the next ## heading (or end of file)
    const nextHeadingLineIdx = headingLines.find((l) => l > headingLineIdx)
    const insertIdx = nextHeadingLineIdx ?? lines.length

    const imageMarkdown = buildImageMarkdown(sel.photo, sel.altText)
    lines.splice(insertIdx, 0, '', imageMarkdown, '')
  }

  return lines.join('\n')
}
