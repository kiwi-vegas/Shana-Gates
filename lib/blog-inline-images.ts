import Anthropic from '@anthropic-ai/sdk'

// ── Types ─────────────────────────────────────────────────────────────────

export interface UnsplashPhoto {
  id: string
  thumbUrl: string
  regularUrl: string
  authorName: string
  authorUrl: string
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
  photo: Pick<UnsplashPhoto, 'regularUrl' | 'authorName' | 'authorUrl'>
}

// ── Coachella Valley expert system prompt ─────────────────────────────────

const CV_EXPERT_SYSTEM = `You are a lifelong Coachella Valley resident, real estate blogger, and REALTOR® who knows the area's exact landmarks and visual character inside out.

You know that great inline blog photos for this area look like:
- Mid-century modern homes on Palm Canyon Drive in Palm Springs
- PGA West golf courses in La Quinta with mountain backdrops
- Empire Polo Club grounds in Indio (Coachella/Stagecoach venue)
- BNP Paribas Tennis Garden in Indian Wells
- El Paseo shopping district in Palm Desert
- Agua Caliente Casino in Rancho Mirage
- Date palm groves along Highway 111 in Indio
- La Quinta Cove hillside homes against the Santa Rosa Mountains
- The aerial tramway ascending San Jacinto in Palm Springs
- Desert landscaping with ocotillo, agave, and saguaro
- Mountain-view pools at sunset in the Coachella Valley

You never suggest beach photos, ocean scenes, tropical foliage, snow, or cityscapes. Every photo choice is grounded in the desert Southwest aesthetic.

When asked to identify image placements for a blog post, respond with PURE JSON only (no markdown fences, no extra text). Return exactly 2 placements as an array.`

// ── Claude: extract image placements from article context ─────────────────

export async function extractImagePlacements(
  title: string,
  contentContext: string,
  category: string
): Promise<ImagePlacement[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const userMessage = `Blog post title: "${title}"
Category: ${category}
Content context: ${contentContext}

Identify exactly 2 sections in this blog post where an inline photo would make the reader pause, feel something, or better understand the content. For each placement return sectionIndex (0 = first ## heading, 1 = second ## heading, etc.), a short concept description, a descriptive alt text, and a 3–5 word Unsplash search query that would find a relevant, high-quality landscape photo. Desert Southwest / Coachella Valley imagery is strongly preferred.

Return pure JSON array with exactly 2 objects: [{"sectionIndex": 0, "concept": "...", "altText": "...", "searchQuery": "..."}, {"sectionIndex": 2, "concept": "...", "altText": "...", "searchQuery": "..."}]`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: CV_EXPERT_SYSTEM,
    messages: [{ role: 'user', content: userMessage }],
  })

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  try {
    const placements = JSON.parse(raw) as ImagePlacement[]
    return placements.slice(0, 2)
  } catch {
    // Fallback: two safe default placements
    return [
      { sectionIndex: 0, concept: 'Coachella Valley desert landscape', altText: 'Desert landscape in the Coachella Valley with mountain views', searchQuery: 'desert palm springs mountains' },
      { sectionIndex: 2, concept: 'Palm Springs mid-century modern home', altText: 'Mid-century modern home with pool in Palm Springs', searchQuery: 'mid century modern pool desert' },
    ]
  }
}

// ── Unsplash: search for photos ───────────────────────────────────────────

export async function searchUnsplash(query: string, count = 3): Promise<UnsplashPhoto[]> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (!accessKey) return []

  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape&content_filter=high`

  let data: any
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    })
    if (!res.ok) return []
    data = await res.json()
  } catch {
    return []
  }

  return (data.results || []).map((r: any) => ({
    id: r.id,
    thumbUrl: r.urls?.small ?? '',
    regularUrl: r.urls?.regular ?? '',
    authorName: r.user?.name ?? 'Unknown',
    authorUrl: r.user?.links?.html ?? 'https://unsplash.com',
  }))
}

// ── Orchestrate: suggestions for multiple items ───────────────────────────

export async function getSuggestionsForItems(
  items: { id: string; title: string; contentContext: string; category: string }[]
): Promise<ImageSuggestion[]> {
  return Promise.all(
    items.map(async (item) => {
      const placements = await extractImagePlacements(item.title, item.contentContext, item.category)
      const placementsWithPhotos = await Promise.all(
        placements.map(async (placement) => ({
          ...placement,
          photos: await searchUnsplash(placement.searchQuery, 3),
        }))
      )
      return {
        itemId: item.id,
        title: item.title,
        placements: placementsWithPhotos,
      }
    })
  )
}

// ── Build markdown for a single approved image ────────────────────────────

export function buildImageMarkdown(
  photo: Pick<UnsplashPhoto, 'regularUrl' | 'authorName' | 'authorUrl'>,
  altText: string
): string {
  return `![${altText}](${photo.regularUrl})\n*Photo by [${photo.authorName}](${photo.authorUrl}) on [Unsplash](https://unsplash.com)*`
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

    // Find end of this section: next ## heading or end of file
    let insertIdx: number
    const nextHeadingLineIdx = headingLines.find((l) => l > headingLineIdx)
    if (nextHeadingLineIdx !== undefined) {
      // Insert just before the next heading, after any trailing blank lines
      insertIdx = nextHeadingLineIdx
    } else {
      insertIdx = lines.length
    }

    const imageMarkdown = buildImageMarkdown(sel.photo, sel.altText)
    lines.splice(insertIdx, 0, '', imageMarkdown, '')
  }

  return lines.join('\n')
}
