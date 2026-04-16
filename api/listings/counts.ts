/**
 * GET /api/listings/counts
 *
 * Returns active listing counts for all 9 Coachella Valley cities by scraping
 * YLOPO's search portal server-side. Cached at Vercel CDN for 1 hour so YLOPO
 * only gets hit at most once per hour per edge region.
 *
 * Response: { counts: { "Palm Springs": 245, "Palm Desert": null, ... } }
 * A null value means the count couldn't be determined — the map falls back to
 * showing just the city name.
 */

const CITIES = [
  'Palm Springs',
  'Palm Desert',
  'Rancho Mirage',
  'Indian Wells',
  'La Quinta',
  'Indio',
  'Cathedral City',
  'Desert Hot Springs',
  'Coachella',
]

const SEARCH_BASE = 'https://search.searchcoachellavalleyhomes.com'

async function fetchCityCount(city: string): Promise<number | null> {
  const params = new URLSearchParams({
    's[locations][0][city]': city,
    's[locations][0][state]': 'CA',
    's[propertyTypes][0]': 'house',
    's[propertyTypes][1]': 'condo',
    's[propertyTypes][2]': 'townhouse',
    's[status]': 'active',
  })
  const url = `${SEARCH_BASE}/search?${params.toString()}`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) return null
    const html = await res.text()

    // 1. Try __NEXT_DATA__ (Next.js SSR — most likely for modern YLOPO)
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1])
        const pp = nextData?.props?.pageProps
        const candidates = [
          pp?.total,
          pp?.totalCount,
          pp?.count,
          pp?.results?.total,
          pp?.results?.totalCount,
          pp?.listings?.total,
          pp?.listings?.totalCount,
          pp?.searchResults?.total,
          pp?.data?.total,
          pp?.data?.count,
        ]
        const found = candidates.find((v) => typeof v === 'number' && v >= 0)
        if (found !== undefined) return found
      } catch {
        // continue to other methods
      }
    }

    // 2. Try inline JSON data blobs (Redux, Apollo, or other state hydration)
    const jsonPatterns = [
      /"totalResults"\s*:\s*(\d+)/,
      /"totalCount"\s*:\s*(\d+)/,
      /"resultCount"\s*:\s*(\d+)/,
      /"listingCount"\s*:\s*(\d+)/,
      /"numFound"\s*:\s*(\d+)/,
    ]
    for (const pat of jsonPatterns) {
      const m = html.match(pat)
      if (m) {
        const n = parseInt(m[1], 10)
        if (n > 0) return n
      }
    }

    // 3. Try human-readable count in page text / title
    const textPatterns = [
      /(\d[\d,]+)\s+(?:homes?|properties|listings)\s+(?:for sale|found|available|match)/i,
      /(?:showing|found|view)\s+(\d[\d,]+)\s+(?:homes?|properties|listings)/i,
      /(\d[\d,]+)\s+(?:Results|results)/,
    ]
    for (const pat of textPatterns) {
      const m = html.match(pat)
      if (m) {
        const n = parseInt(m[1].replace(/,/g, ''), 10)
        if (n > 0) return n
      }
    }

    return null
  } catch {
    return null
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Fetch all cities in parallel — each has its own 10s timeout
  const results = await Promise.allSettled(
    CITIES.map(async (city) => {
      const count = await fetchCityCount(city)
      return { city, count }
    })
  )

  const counts: Record<string, number | null> = {}
  for (const r of results) {
    if (r.status === 'fulfilled') {
      counts[r.value.city] = r.value.count
    } else {
      // rejected = timeout or unexpected error; leave the key absent
    }
  }

  // Cache at Vercel CDN edge for 1 hour, allow stale for another 10 min
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600')
  res.setHeader('Access-Control-Allow-Origin', '*')
  return res.status(200).json({ counts })
}
