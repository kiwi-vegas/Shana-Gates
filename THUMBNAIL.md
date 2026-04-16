# Blog Thumbnail Generation — Shana Gates

> Full spec for hero image creation. Referenced by `BLOG.md`.
> Implementation lives in `lib/blog-image-gen.ts` + `lib/blog-images.ts`.

---

## Goal

Every blog post thumbnail should look like a **professional YouTube or TV news thumbnail**:

- Cinematic, location-specific Coachella Valley background
- Bold text overlay burned into the image (article title or punchy version of it)
- Small graphic accent that visually reinforces the article's market direction
- Scroll-stopping at small size — readable, striking, specific

**Reference style:** Fox Business / Bloomberg real estate segment thumbnails. See the three examples shared during setup — bold city name, short headline text, single directional icon.

---

## Image Structure (3 Layers)

Every generated image must describe all three layers:

### Layer 1 — Background
A specific, recognizable scene **in the detected city** (see City Detection below).
- Always Coachella Valley / Palm Springs area, California
- Never: beaches, ocean, tropical scenes, East Coast cities, generic suburbs
- Lighting: cinematic golden hour or dramatic dusk/blue-hour
- Quality: 4K photorealistic

### Layer 2 — Text Overlay
The article title (or a short punchy version) rendered **in the image itself**.
- Bold modern sans-serif, white text, dark drop shadow
- Placed upper-left or centered, large enough to read as a thumbnail
- If the article is city-specific, the city name is the **largest element**
- Format: `"INDIAN WELLS: Home Prices Rise 12%"` (city: headline)

### Layer 3 — Graphic Accent
A small, bold, flat/illustrated graphic element near the title.
- **NOT photorealistic** — icon/arrow style, like a news broadcast graphic
- Must reinforce the article's market direction (see Sentiment Detection below)
- Examples: upward blue arrow for growth stories, downward amber arrow for declines, gold coin for investment, house key for buying tips

---

## City Detection

`detectCity()` in `lib/blog-image-gen.ts` scans the full article text (title + key message + body) for any of the 8 Coachella Valley cities:

| Detected city | Background scene used |
|---|---|
| Palm Springs | Palm Canyon Drive, MCM homes, Aerial Tramway, Uptown Design District |
| Cathedral City | Date Avenue, Desert Princess Golf Club, residential neighborhoods |
| Rancho Mirage | Luxury gated estates, Sinatra Drive, Agua Caliente Casino |
| Palm Desert | El Paseo Shopping District, fairways, Living Desert Zoo |
| Indian Wells | BNP Paribas Tennis Garden, ultra-luxury estates, Hyatt Regency resort |
| La Quinta | PGA West TPC Course, La Quinta Resort, Old Town, La Quinta Cove |
| Indio | Empire Polo Club / Coachella Festival grounds, date palm groves |
| Coachella | City aerial, Salton Sea view, wind turbines, new developments |
| *(no city)* | Full valley aerial, palm-lined boulevard, San Jacinto panorama |

**Rule:** "Coachella Valley" is checked before "Coachella" to avoid false matches.

---

## Sentiment Detection

`detectSentiment()` scans the title + key message for market direction signals:

| Signal | Examples | Graphic accent |
|---|---|---|
| **UP** | rises, surges, growth, boom, record high, migration, appreciation, rally | Bold upward arrow — electric blue or teal glow |
| **DOWN** | falls, drops, declining, cooling, correction, price cut, soft market | Bold downward arrow — warm amber/orange |
| **NEUTRAL** | informational, tips, spotlight, guide | Category-specific icon (see below) |

### Category fallback accents (when sentiment is neutral)

| Category | Accent |
|---|---|
| `market-update` | Upward arrow, electric blue |
| `buying-tips` | Gold house key or house icon with sparkle |
| `selling-tips` | "SOLD" ribbon or gold price arrow |
| `community-spotlight` | Glowing location pin in bronze/gold |
| `investment` | Gold coin stack or trend chart line |
| `news` | Bold accent bar + arrow in electric blue |
| `local-area` | Sun icon or palm tree silhouette in warm gold |
| `market-insight` | Minimalist trend line or bar chart in electric blue |

---

## Generation Pipeline

```
buildImagePrompt()       ← Claude Sonnet builds the detailed Gemini prompt
  │  Inputs: title, whyItMatters, category, body
  │  Detects: city, sentiment
  │  Outputs: 6–9 sentence prompt with all 3 layers described
  │
  ▼
generateWithGemini()     ← Primary: gemini-2.0-flash-preview-image-generation
  │  16:9, photorealistic, text + graphics rendered in image
  │
  ├─ [success] → uploadToSanity() → Sanity CDN asset ID
  │
  ▼ [fail / timeout at 20s]
generateWithDallE()      ← Fallback 1: DALL-E 3, 1792×1024 HD
  │  requires OPENAI_API_KEY
  │
  ├─ [success] → uploadToSanity() → Sanity CDN asset ID
  │
  ▼ [fail]
scrapeOgImage()          ← Fallback 2: OG image from source article URL
  │  (daily pipeline only — weekly has no source URL)
  │
  ├─ [success] → externalUrl (served directly, not uploaded to Sanity)
  │
  ▼ [fail]
buildMapboxUrl()         ← Fallback 3: Mapbox satellite-streets map of detected city
                            1280×720, satellite-streets-v12 style
                            Geographically accurate to the specific city
                            externalUrl (Mapbox CDN)
```

**AI generation timeout:** None — Gemini runs to completion. Fallbacks only trigger on actual API errors. Vercel publish functions have `maxDuration: 120`.

---

## Prompt Construction (Claude's Instructions to Gemini)

Claude Sonnet is given:
- The article title and key message
- The detected city and its specific visual anchors
- The market direction (UP / DOWN / NEUTRAL)
- The overlay text to render (short title, city-prefixed if needed)
- The specific graphic accent to include

Claude returns a **single 6–9 sentence prompt** describing:
1. The specific Coachella Valley background scene
2. Exact text placement and styling
3. Graphic accent placement and style

This prompt is passed directly to Gemini (and DALL-E as fallback).

---

## Known Issues & Improvement Areas

- [ ] **Gemini text rendering** — Gemini sometimes garbles or ignores text overlays. May need to switch to generating a clean background image and compositing text server-side (e.g. with `sharp` or `canvas`).
- [ ] **City matching edge cases** — articles that mention multiple cities (e.g. "Palm Springs vs Palm Desert") will match whichever city appears first. May want to pick the city mentioned most frequently.
- [ ] **Sentiment false positives** — keywords like "falling in love" or "drop everything" could trigger DOWN sentiment. May want title-only detection rather than full body scan.
- [ ] **Graphic accent quality** — AI models treat "flat icon" differently. Exploring a fixed icon overlay composited post-generation could give more consistent results.
- [ ] **Unsplash** — currently bypassed (Mapbox used instead). Can be re-enabled by swapping the return in `generateHeroImage()` in `lib/blog-images.ts`.

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_API_KEY` | Yes | Gemini image generation (primary) |
| `OPENAI_API_KEY` | Optional | DALL-E 3 fallback |
| `MAPBOX_TOKEN` | Optional | Uses hardcoded public pk. token if not set |
| `UNSPLASH_ACCESS_KEY` | Optional | Currently unused (Mapbox preferred) |

---

## Key Files

| File | Role |
|---|---|
| `lib/blog-image-gen.ts` | `detectCity()`, `detectSentiment()`, `buildImagePrompt()`, `generateWithGemini()`, city coords |
| `lib/blog-images.ts` | `generateHeroImage()` — orchestrates full fallback chain, Mapbox fallback |
