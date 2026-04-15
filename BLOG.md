# Shana Gates — Blog Content System

## Overview

Two automated pipelines feed the `/blog` listing page:

1. **Daily news pipeline** — Tavily researches Coachella Valley real estate news, Claude Opus scores top articles, Shana picks 1–5 to publish via a morning email digest, Claude Sonnet writes full posts with AI hero images, published to Sanity CMS
2. **Weekly original content pipeline** — Every Saturday night, Claude researches 2–3 original topic ideas per category (5 categories = ~10–15 total), Shana gets a Sunday morning email, picks topics to write, Claude writes full posts, published to Sanity CMS

Both appear together on `/blog`, merged and sorted by `publishedAt` descending. A category filter bar at the top lets readers filter by type.

**Market:** Coachella Valley, CA — Palm Springs, Palm Desert, Rancho Mirage, Indian Wells, La Quinta, Indio, Cathedral City, Desert Hot Springs, Coachella
**Agent:** Shana Gates, REALTOR® at Craft & Bauer | Real Broker
**Blog page title:** Coachella Valley Real Estate Blog
**Sanity project ID:** `ll3zy5cp`
**Production URL:** `https://shanasells.com` / `https://shana-gates.vercel.app`

---

## Pipeline 1: Daily News Flow

```
6:00 AM PT daily (Vercel Cron)
  └─ /api/cron/research
       ├─ Tavily searches 8 rotating queries (Coachella Valley focused)
       ├─ Claude Opus scores & categorizes top 10 articles
       ├─ Stores results in Upstash Redis (48hr TTL)
       └─ Sends daily digest email to Shana

Shana opens email
  └─ Clicks "Pick Articles to Publish →"
       └─ /admin/blog-picker/ (auth-gated)
            ├─ Shows up to 10 articles with scores and summaries
            ├─ Shana selects 1–5 articles
            └─ Clicks "Publish X Posts →"

                 └─ /api/blog/publish (POST)
                      ├─ For each selected article (in parallel):
                      │    ├─ Claude Sonnet writes full blog post (Shana Gates voice)
                      │    └─ Image generation pipeline (see below)
                      ├─ Images uploaded to Sanity CDN
                      ├─ Posts published to Sanity CMS
                      └─ Live at /blog within 60 seconds
```

---

## Pipeline 2: Weekly Original Content Flow

```
Saturday 8:00 PM PT (Vercel Cron)
  └─ /api/cron/weekly
       ├─ For each of 5 categories:
       │    ├─ Tavily searches for recent Coachella Valley context
       │    └─ Claude Opus generates 2–3 original topic ideas per category
       ├─ Stores 10–15 topic ideas in Upstash Redis (72hr TTL)
       └─ Sends Sunday digest email to Shana (organized by category)

Shana opens email Sunday morning
  └─ Clicks "Review & Publish Your Weekly Posts →"
       └─ /admin/weekly-picker/ (auth-gated)
            ├─ Shows topics organized by category tabs
            ├─ Shana selects which topics to write
            └─ Clicks "Write & Publish Selected →"

                 └─ /api/blog/publish-weekly (POST)
                      ├─ For each selected topic (in parallel):
                      │    ├─ Claude Sonnet writes full blog post (Shana Gates voice)
                      │    └─ Image generation pipeline
                      ├─ Images uploaded to Sanity CDN
                      ├─ Posts published to Sanity CMS
                      └─ Live at /blog within 60 seconds
```

**Excluded from weekly automation** (require Shana's input to do manually):
- **Listing Spotlight** — needs specific property URLs from Shana
- **Repurposed Social Post** — needs a YouTube or Instagram link from Shana

---

## Daily Research — Market & Topic Priorities

**ALL articles must be about the Coachella Valley, Palm Springs area, or directly relevant California real estate law/policy.**
Articles about other markets (Las Vegas, Texas, Florida, etc.) are scored 1 and dropped.

Claude gives extra weight to these high-value topics:

### 1. Coachella Valley Property Values & Market Trends
- Home price forecasts and appreciation trends across all 9 cities
- Inventory levels, days on market, and buyer competition
- Palm Springs, Palm Desert, La Quinta, and Rancho Mirage market comparisons
- What market conditions mean for current buyers and sellers

### 2. California Law Changes Affecting Homeowners
- Prop 19 (property tax transfers), Prop 33 / rent control updates
- HOA regulation changes
- Short-term rental ordinances (Palm Springs STR rules are especially relevant)
- Any California legislation affecting real estate transactions

### 3. Luxury & Resort Market
- Indian Wells and Rancho Mirage luxury home trends
- Second home and vacation property demand
- Seasonal buyer patterns (snowbirds, winter visitors)
- Golf course community values (La Quinta, PGA West, Mission Hills)

### 4. Short-Term Rental Market
- Palm Springs STR permit regulations and changes
- Airbnb / VRBO investment ROI in the valley
- City-by-city STR ordinance comparisons
- Vacation rental management trends

### 5. Major Development Projects (Economic Growth Signals)
- New resort, hotel, or mixed-use development in the valley
- Infrastructure improvements (I-10, Tramway, airport expansion)
- Corporate investment or employer relocations
- Any project signaling long-term housing demand

### 6. Seasonal & Event-Driven Demand
- Coachella/Stagecoach Festival impact on local housing and rentals
- Snowbird season trends and winter visitor housing demand
- Desert tourism trends affecting the real estate market
- BNP Paribas Open / Acrisure Arena economic impact

### 7. Golf & Lifestyle Communities
- PGA West, La Quinta Country Club, Desert Horizons market effects
- Active adult and retirement community trends
- Desert lifestyle amenities affecting buyer decisions

### 8. Desert Retirement & Active Adult Market
- Sun City Palm Desert, Trilogy at La Quinta, similar community trends
- 55+ buyer demand and supply across the valley
- Age-in-place features buyers are prioritizing

---

## Weekly Research — Original Content Categories

For each category, Claude generates 2–3 original blog topic ideas based on current Coachella Valley context:

| Category | Focus |
|---|---|
| **Local Area Topic** | Seasonal events, local amenities, lifestyle features, things to do in specific cities |
| **Market Insight** | MLS data analysis, price trends, inventory interpretation for the valley |
| **Buyer/Seller Advice** | Desert-specific buying tips, pricing strategies, staging for desert buyers, seasonal timing |
| **Community Spotlight** | Deep-dive on one Coachella Valley city — lifestyle, market, what makes it unique |
| **Investment** | STR ROI analysis, vacation property buying guide, desert market investment outlook |

**Compliance:** Never mention school quality, ratings, or test scores in any of these topics.

---

## Image Generation Pipeline

### Primary: Gemini (requires `GOOGLE_API_KEY`)

Every hero image is built using **3-step thumbnail psychology**:

1. **Visual Stun Gun** — The image stops the scroll. Would someone slow their thumb for this?
2. **Title Value Hunt** — After stopping, the reader scans the headline. The image makes it feel MORE urgent and relevant.
3. **Visual Validation** — The reader returns to the image to confirm the article is worth reading.

**Step 1 — Claude builds the prompt**
Claude Sonnet analyzes the article's title, `whyItMatters`, and category, then writes a cinematic image prompt using Coachella Valley visual anchors and a desire loop for the article's category. Returns ONLY the prompt, 5–8 sentences.

**Coachella Valley visual anchors:**
- Palm Springs hillside homes at golden hour — warmth, luxury, aspiration
- Palm tree-lined streets under a deep blue sky — iconic desert lifestyle
- San Jacinto Mountains framing a valley neighborhood — scale, natural grandeur
- Mid-century modern architecture with a pool — style, heritage, investment appeal
- Desert sunset with dramatic gradient sky — aspirational, escapism
- Luxury backyard pool with mountain backdrop — high-end resort living
- Golf course fairway with mountain views — affluence, lifestyle
- Aerial view of the Coachella Valley with mountain borders — unique geography, scale
- Joshua trees and desert flora — natural identity, Californian character

**Step 2 — Gemini generates the image** — `gemini-3-pro-image-preview`, 16:9, base64 PNG inline

**Step 3 — Upload to Sanity CDN** — stored as `shana-blog-cover-{timestamp}.png`

### Fallback Chain (if Gemini fails)

1. **Imagen 4.0** (`imagen-4.0-generate-001`) — same prompt, 16:9
2. **Gemini 2.5 Flash Image** (`gemini-2.5-flash-image`)
3. **DALL-E 3** (requires `OPENAI_API_KEY`) — 1792×1024 HD
4. **OG image** scraped from the source article URL
5. **Unsplash API** (requires `UNSPLASH_ACCESS_KEY`) — category-matched query
6. **Fallback image pool** — pre-curated Unsplash URLs per category, deterministic pick by article URL hash

---

## Blog Listing Page (`/blog`)

**Title:** Coachella Valley Real Estate Blog

Both blog posts are fetched from Sanity CDN and merged into a single feed sorted by `publishedAt` descending.

### Category Filter Tabs

| Tab label | Filter value | Pipeline source |
|---|---|---|
| All | *(none)* | Both |
| Market Update | `market-update` | Daily |
| Local Area | `local-area` | Weekly |
| Market Insight | `market-insight` | Weekly |
| Buying Tips | `buying-tips` | Both |
| Selling Tips | `selling-tips` | Both |
| Community Spotlight | `community-spotlight` | Weekly |
| Investment | `investment` | Both |
| News | `news` | Daily |

---

## Article Selection Rules (Daily Pipeline)

- **Volume**: Research fetches up to 30 articles per day, scores top 10 for display
- **Flexibility**: Shana can select 1–5 articles per day
- **No repeats**: Articles skipped twice are permanently filtered (Redis `article_shown_counts`)
- **Rotation**: 8 queries per day, rotating through 25 topic queries so all buckets get covered over time

---

## Article Categories

| Category | Label | Color |
|---|---|---|
| `market-update` | Market Update | Blue `#2563eb` |
| `buying-tips` | Buying Tips | Green `#4CAF50` |
| `selling-tips` | Selling Tips | Sky `#0ea5e9` |
| `community-spotlight` | Community Spotlight | Purple `#9C27B0` |
| `investment` | Investment | Orange `#FF9800` |
| `news` | News | Slate `#607D8B` |
| `local-area` | Local Area | Amber `#D97706` |
| `market-insight` | Market Insight | Indigo `#4338CA` |

---

## Blog Post Writing Voice

Each post is written by Claude Sonnet 4.6 as **Shana Gates, REALTOR® at Craft & Bauer | Real Broker**, a Coachella Valley real estate professional. Voice is:
- Knowledgeable and approachable, never salesy
- Second-person ("you/your") to make the message personal and actionable
- Ties national or California news back to the local Coachella Valley / Palm Springs area market
- Always includes a "## What This Means For You" section with 3–4 bullet points
- Closes with a CTA to contact Shana

Post structure:
1. Engaging headline (rewritten from source for daily, original for weekly)
2. Opening question (the exact question the blog answers)
3. 1–2 sentence "snippet answer" directly below the question
4. 2–3 body sections with `##` subheadings
5. `## What This Means For You` (3–4 bullet points)
6. Closing paragraph
7. Call-to-action: *"Ready to make your move in the Coachella Valley? Reach out to Shana Gates at Craft & Bauer — she knows this market inside and out. [Contact Shana →](mailto:shana@craftbauer.com)"*

---

## Compliance Guardrails (Hardcoded — Never Override)

All writing tools must strictly avoid:
- Any mention of **school quality**, ratings, or test scores
- Any descriptions of **safety**, "family-friendly," or protected-class language (Fair Housing Act)
- Any **RESPA-sensitive** references (promoting specific lenders, inspectors, or vendors)
- Any **fabricated data**, statistics, or unverifiable citations — cite real sources or omit
- Any statements that could be interpreted as **steering**, exclusion, or demographic profiling

---

## Sanity CMS — `blogPost` Document Type

```typescript
{
  _type: 'blogPost',
  title: string,
  slug: { current: string },       // URL-safe, unique
  publishedAt: string,              // ISO datetime
  category: 'market-update' | 'buying-tips' | 'selling-tips' |
            'community-spotlight' | 'investment' | 'news' |
            'local-area' | 'market-insight',
  excerpt: string,                  // max 200 chars
  body: string,                     // markdown
  heroImage: {
    _type: 'image',
    asset: { _type: 'reference', _ref: string }
  },
  sourceUrl: string,                // original article URL (daily pipeline only)
  sourceTitle: string,              // original article title
  pipeline: 'daily' | 'weekly',
}
```

---

## Environment Variables Required

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude Sonnet (writing + prompt building) + Claude Opus (scoring) |
| `GOOGLE_API_KEY` | Gemini/Imagen image generation (primary) |
| `OPENAI_API_KEY` | DALL-E 3 fallback |
| `TAVILY_API_KEY` | Article research + topic discovery |
| `UPSTASH_REDIS_REST_URL` | Article/topic storage (48–72hr TTL) |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth |
| `RESEND_API_KEY` | Email delivery (daily digest + Sunday digest) |
| `FROM_EMAIL` | Sender address |
| `OPERATOR_EMAIL` | Shana's email for both digest emails |
| `ADMIN_SECRET` | Auth for blog pickers and publish APIs |
| `CRON_SECRET` | Auth for Vercel cron jobs |
| `SANITY_PROJECT_ID` | `ll3zy5cp` (already set) |
| `SANITY_DATASET` | `production` (already set) |
| `SANITY_WRITE_TOKEN` | Sanity Editor-role token (already set) |
| `UNSPLASH_ACCESS_KEY` | Optional — Unsplash fallback images |

**IMPORTANT:** Always use `printf` (not `echo`) when setting env vars via Vercel CLI — `echo` adds a trailing newline that corrupts the value:
```bash
printf 'your-value' | npx vercel env add VAR_NAME production
```

---

## Manual Testing

### Trigger daily research manually:
```bash
curl -X POST https://shanasells.com/api/cron/research \
  -H "Content-Type: application/json" \
  -d '{"secret": "YOUR_CRON_SECRET"}'
```

### Trigger weekly research manually:
```bash
curl -X POST https://shanasells.com/api/cron/weekly \
  -H "Content-Type: application/json" \
  -d '{"secret": "YOUR_CRON_SECRET"}'
```

### View stored articles for a date:
```
GET /api/blog/articles?date=2026-04-15&secret=YOUR_ADMIN_SECRET
```

### View weekly topics:
```
GET /api/blog/weekly-topics?secret=YOUR_ADMIN_SECRET
```

---

## Key Files

### Blog Pipeline
| File | Purpose |
|---|---|
| `lib/research.ts` | Tavily searches + Claude Opus scoring — Coachella Valley queries only |
| `lib/weekly-research.ts` | Claude Opus generates 2–3 topic ideas per category using Tavily context |
| `lib/writer.ts` | Claude Sonnet writes blog post as Shana Gates, REALTOR® |
| `lib/blog-image-gen.ts` | Gemini image generation — Coachella Valley visual anchors |
| `lib/blog-images.ts` | Orchestrates full image fallback chain |
| `lib/blog-email.ts` | All emails: daily digest + Sunday weekly digest |
| `lib/blog-store.ts` | Upstash Redis read/write |
| `lib/blog-sanity.ts` | Publishes content to Sanity CMS |
| `api/cron/research.ts` | Daily blog research cron (6 AM PT) |
| `api/cron/weekly.ts` | Weekly topic research cron (Sat 8 PM PT) |
| `api/blog/publish.ts` | Daily publish endpoint (1–5 articles) |
| `api/blog/publish-weekly.ts` | Weekly publish endpoint (1+ topics) |
| `api/blog/articles.ts` | Returns stored daily articles from Redis |
| `api/blog/weekly-topics.ts` | Returns stored weekly topics from Redis |
| `admin/blog-picker/index.html` | Daily article selection UI |
| `admin/weekly-picker/index.html` | Weekly topic selection UI (category tabs) |
| `blog/index.html` | Blog listing — fetches from Sanity CDN, category filter |
| `blog/post.html` | Individual blog post — reads `?slug=` param |

### Cron Schedule (`vercel.json`)
| Schedule | Route | What it does |
|---|---|---|
| `0 13 * * *` (6 AM PT daily) | `/api/cron/research` | Daily news research + digest email to Shana |
| `0 3 * * 0` (8 PM PT Saturday) | `/api/cron/weekly` | Weekly topic generation + Sunday digest email |
