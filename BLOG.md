# Shana Gates — Blog Content System

## Overview

Three automated pipelines feed the `/blog` listing page:

1. **Daily news pipeline** — Tavily researches Coachella Valley real estate news, Claude Opus scores top articles, Shana picks 1–5 to publish via a morning email digest, Claude Sonnet writes full posts with AI hero images, published to Sanity CMS
2. **Weekly original content pipeline** — Every Saturday night, Claude researches 2–3 original topic ideas per category (5 categories = ~10–15 total), Shana gets a Sunday morning email, picks topics to write, Claude writes full posts, published to Sanity CMS
3. **Monthly events pipeline** — On the 25th of each month, Tavily searches for events in all 9 Coachella Valley cities for the *upcoming* month, Claude aggregates into 5–8 article briefs, automatically visible in the Blog Picker under Local Happenings

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

## Pipeline 3: Monthly Events Flow

```
25th of every month at 7:00 AM PT (Vercel Cron)
  └─ /api/cron/events
       ├─ Determines next month name + year (handles Dec→Jan year rollover)
       ├─ Runs 8 Tavily searches in parallel:
       │    ├─ "Coachella Valley events {Month} {Year}"
       │    ├─ "Greater Palm Springs things to do {Month} {Year}"
       │    ├─ "Palm Springs events {Month} {Year}"
       │    ├─ "Palm Desert events {Month} {Year}"
       │    ├─ "La Quinta Rancho Mirage Indian Wells events {Month} {Year}"
       │    ├─ "Indio Cathedral City events {Month} {Year}"
       │    ├─ "Coachella Valley concerts festivals {Month} {Year}"
       │    └─ "Palm Springs VillageFest farmers market free events {Year}"
       ├─ Claude Haiku aggregates into 5–8 article briefs with rules:
       │    ├─ Always: valley-wide roundup ("What's Happening in the Coachella Valley This {Month} {Year}")
       │    ├─ Always: free events article ("Free Events & Farmers Markets in the Coachella Valley: {Month} {Year}")
       │    ├─ City-specific article if a city has 3+ distinct events
       │    └─ Optional theme articles (concerts, dining, outdoor activities)
       ├─ Every title includes month + year (required)
       └─ Stored in Upstash Redis: event_articles:{YYYY-MM} (20-day TTL)

Blog Picker (/admin/blog-picker/) fetches /api/blog/articles which:
  ├─ Always merges current month's event articles
  └─ Also merges next month's event articles when day of month >= 24
```

**Result:** From the 25th of every month, Shana automatically sees next month's event article
briefs in the Local Happenings tab of her Blog Picker — no manual setup needed.

**Redis key:** `event_articles:{YYYY-MM}` (e.g. `event_articles:2026-05`)
**TTL:** 20 days — covers the pre-month window plus the full publishing month
**Categories:** All articles use `local-happenings`
**Article IDs:** `ev-{YYYY}-{MM}-{01..08}` (deterministic, safe to re-run)

**Triggering manually:**
```
POST /api/cron/events
Authorization: Bearer {CRON_SECRET}
```

---

## Auto Entity Linking

Every blog post is automatically enriched with outbound links to official websites for named entities mentioned in the content — festivals, parks, government agencies, schools, sports venues, museums, and named organizations.

**How it works:**
- After Claude Sonnet writes a post body, `lib/blog-entity-links.ts` sends the text to Claude Haiku
- Haiku identifies named entities that have known official websites (e.g. Coachella Music Festival, BNP Paribas Open, City of Palm Springs, Joshua Tree National Park, Palm Springs Art Museum)
- First occurrence of each entity is wrapped in a Markdown link: `[Coachella Music Festival](https://www.coachella.com)`
- Links open in a new tab (`target="_blank"`)
- Runs on every new post automatically (daily + weekly + events pipelines)

**Equity / home-value phrases** are separately auto-linked to the seller valuation page at `https://search.searchcoachellavalleyhomes.com/seller` — phrases like "home equity," "home value," "property valuation," "what your home is worth," etc.

**Retroactive enrichment:**
To enrich existing published posts, go to `/admin/blog-editor/` and click **"Enrich Last 6 Posts"**. This calls `POST /api/blog/enrich-posts` (maxDuration: 120s) which processes the N most recent posts and updates their bodies in Redis.

**What IS auto-linked:**
- Named festivals (Coachella, Stagecoach, BNP Paribas Open, Modernism Week, etc.)
- City governments (City of Palm Springs, City of Palm Desert, etc.)
- Named parks (Joshua Tree National Park, Indian Canyons, etc.)
- Named cultural venues (Palm Springs Art Museum, McCallum Theatre, etc.)
- Named schools, universities, community organizations

**What is NOT auto-linked:**
- Shana Gates, Craft & Bauer, Real Broker (Shana's own brand)
- Vague references ("local restaurants," "the city," "nearby businesses")
- Generic service categories

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
| **Market Updates** | MLS data analysis, price trends, inventory interpretation, CA law changes affecting buyers/sellers |
| **Investor Tips** | STR ROI analysis, vacation property buying guide, desert market investment outlook, short-term rental rules |
| **Seller Tips** | Desert-specific pricing strategies, staging for desert buyers, seasonal timing, listing advice |
| **Local Happenings** | Seasonal events, farmers markets, community news, local amenities, things to do in specific CV cities |
| **Trending Topics** | Celebrity real estate news, interesting property sales, viral housing topics with real estate angles |

**Compliance:** Never mention school quality, ratings, or test scores in any of these topics.

---

## Image Generation Pipeline

See **[THUMBNAIL.md](./THUMBNAIL.md)** for the full thumbnail spec — city detection, sentiment detection, city-specific visual anchors, fallback chain, known issues, and improvement notes.

---

## Blog Listing Page (`/blog`)

**Title:** Coachella Valley Real Estate Blog

Both blog posts are fetched from Redis and merged into a single feed sorted by `publishedAt` descending.

### Category Filter Tabs

| Tab label | Filter value | Old aliases (still accepted) |
|---|---|---|
| All Posts | *(none)* | — |
| Market Updates | `market-update` | `market-insight`, `buying-tips` |
| Investor Tips | `investor-tips` | `investment` |
| Seller Tips | `seller-tips` | `selling-tips` |
| Local Happenings | `local-happenings` | `local-area`, `community-spotlight` |
| Trending Topics | `trending-topics` | `news` |

Old category values from pre-2026 posts are normalized to the new taxonomy via `normalizeCategory()` in both `blog/index.html` and `admin/blog-picker/index.html`.

---

## Article Selection Rules (Daily Pipeline)

- **Volume**: Research fetches up to 30 articles per day, scores top 10 for display
- **Flexibility**: Shana can select 1–5 articles per day
- **No repeats**: Articles skipped twice are permanently filtered (Redis `article_shown_counts`)
- **Rotation**: 8 queries per day, rotating through 25 topic queries so all buckets get covered over time

---

## Article Categories

Five canonical categories used by the research pipeline, blog picker, and public blog:

| Category value | Label | Color |
|---|---|---|
| `market-update` | Market Updates | Blue `#2563eb` |
| `investor-tips` | Investor Tips | Orange `#FF9800` |
| `seller-tips` | Seller Tips | Sky `#0ea5e9` |
| `local-happenings` | Local Happenings | Amber `#D97706` |
| `trending-topics` | Trending Topics | Purple `#9C27B0` |

**Why these five:**
- **Market Updates** — the core real estate intelligence feed (prices, inventory, law changes, mortgage rates)
- **Investor Tips** — dedicated STR/vacation rental/investment content for the valley's high investor-owner population
- **Seller Tips** — staging, pricing, timing advice relevant to the strong CV seller market
- **Local Happenings** — events, community news, things to do — drives engagement from non-buyers who later become clients
- **Trending Topics** — celebrity real estate, viral housing news — high-traffic content with broad real estate appeal

Old category values (`buying-tips`, `selling-tips`, `investment`, `community-spotlight`, `local-area`, `news`, `market-insight`) are preserved in Redis/posts for backward compatibility. The `normalizeCategory()` function in the frontend maps them to the nearest new category for display and filtering.

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

## Inline Image Pipeline (Article Body Images)

> **Status: Planned — not yet built.**
> This is separate from hero/thumbnail images (see `THUMBNAIL.md`).
> These are contextual photos embedded *inside* the article body between sections.

### Goal

Every published blog post should contain 2–3 inline photos that visually reinforce what the article is discussing. If the article talks about a swimming pool, show a photo of a pool. If it covers mid-century architecture, show MCM homes. If it's about the Coachella Festival, show the festival grounds. Images are sourced from Unsplash with proper attribution embedded in the markdown — legally compliant and automatic.

---

### User Workflow (Updated Publish Flow)

The image review step is inserted **between article/topic selection and the final publish button** in both picker UIs:

```
Daily picker:
  Select 1–5 articles  →  [NEW] Review Images  →  Publish

Weekly picker:
  Select topics  →  [NEW] Review Images  →  Publish
```

**Review Images step:**
1. For each selected article/topic, Claude writes the full post (preview, not yet published)
2. Claude identifies 2–3 sections where an inline image would add value
3. Unsplash is searched for each section concept — returns 3 image options per placement
4. Shana sees a card per placement: the section heading, 3 photo thumbnails, photographer credit
5. She picks one photo per placement (or skips any placement she doesn't want)
6. Clicks "Publish with Images" — post is published to Sanity with images embedded

---

### Image Source: Unsplash

**Why Unsplash:**
- Free to use commercially with no royalty fees
- High-quality photography that fits the aspirational real estate brand
- Simple attribution requirement: credit the photographer and link back to Unsplash
- API supports keyword search — returns relevant, licenseable photos

**Attribution format (embedded in markdown):**
```markdown
![Alt text describing the photo](https://images.unsplash.com/photo-{id}?w=1200&q=80)
*Photo by [Photographer Name](https://unsplash.com/@handle) on [Unsplash](https://unsplash.com)*
```

This renders as the photo followed by an italic credit line — clean, standard, legally correct.

**Unsplash API endpoint used:**
```
GET https://api.unsplash.com/search/photos?query={search_term}&per_page=3&orientation=landscape
Authorization: Client-ID {UNSPLASH_ACCESS_KEY}
```

---

### How Claude Identifies Image Placements

After writing the post body, Claude is given a second prompt:

> *"Read this blog post. Identify 2–3 sections where an inline photo would make the reader pause, feel something, or understand the content better. For each placement, return: (1) the exact `## Section Heading` it belongs after, (2) a 3–5 word Unsplash search query that would find a relevant, high-quality photo, (3) a one-sentence alt text description."*

Claude returns a structured list like:
```json
[
  { "afterHeading": "## The Rise of Desert Modern Design", "query": "mid-century modern pool desert", "alt": "Sleek mid-century modern home with pool in the desert" },
  { "afterHeading": "## What This Means For You", "query": "couple touring luxury home", "alt": "Couple walking through a bright open-plan home" }
]
```

---

### How Images Are Injected Into the Post Body

After Shana approves images, each selected photo is inserted into the markdown body immediately after its target `## Section Heading`:

```markdown
## The Rise of Desert Modern Design

![Sleek mid-century modern home with pool in the desert](https://images.unsplash.com/photo-xxx?w=1200&q=80)
*Photo by Jane Doe on [Unsplash](https://unsplash.com)*

Buyers across the Coachella Valley are increasingly drawn to...
```

---

### New Files Required

| File | Purpose |
|---|---|
| `lib/blog-inline-images.ts` | `extractImagePlacements()` (Claude) + `searchUnsplash()` + `injectImagesIntoBody()` |
| `api/blog/suggest-images.ts` | `POST` — writes post, extracts placements, searches Unsplash, returns suggestions |

### Changes to Existing Files

| File | Change |
|---|---|
| `admin/blog-picker/index.html` | Add "Review Images" step between selection and publish |
| `admin/weekly-picker/index.html` | Same |
| `api/blog/publish.ts` | Accept `imageApprovals[]` in request body; pass approved images to writer |
| `api/blog/publish-weekly.ts` | Same |
| `lib/writer.ts` | `injectApprovedImages()` helper — inserts approved image markdown into post body |

### New Environment Variable

| Variable | Purpose |
|---|---|
| `UNSPLASH_ACCESS_KEY` | Unsplash API key for image search (already listed — activate it) |

---

### Picker UI — Image Review Card Design

Each image placement shows as a card:

```
┌─────────────────────────────────────────────────────┐
│ After: "## The Rise of Desert Modern Design"         │
│                                                      │
│  [Photo 1]    [Photo 2]    [Photo 3]                 │
│  Jane Doe     Mark Smith   Alex Ray                  │
│  ● Selected                                          │
│                                                      │
│  [ Skip this placement ]                             │
└─────────────────────────────────────────────────────┘
```

---

## Internal Linking System

Blog posts and community pages link back and forth automatically. No manual work required once a post is published.

### How City Detection Works

At write time, `lib/writer.ts` calls `detectCity()` on the post title + source article text. The result is a URL slug stored as the `city` field on the Sanity `blogPost` document.

| City name | Stored as `city` field |
|---|---|
| Palm Springs | `palm-springs` |
| Palm Desert | `palm-desert` |
| Rancho Mirage | `rancho-mirage` |
| Indian Wells | `indian-wells` |
| La Quinta | `la-quinta` |
| Indio | `indio` |
| Cathedral City | `cathedral-city` |
| Desert Hot Springs | `desert-hot-springs` |
| Coachella | `coachella` |

Posts that don't match a specific city (general Coachella Valley content) have `city: undefined` and do not generate community links.

---

### Blog Post → Community Page

Every blog post page (`/blog/post.html`) automatically shows a **community link card** between the post body and the "Contact Shana" CTA whenever `post.city` is set.

The card contains:
- **Community Guide →** — links to the city's community page (`/palm-springs.html`, etc.)
- **Search Active Listings →** — links to the YLOPO search filtered to that city

Example for a post tagged `city: 'la-quinta'`:
```
┌──────────────────────────────────────────────────────────────┐
│ EXPLORE LA QUINTA                                            │
│ Homes for Sale in La Quinta                                  │
│                              [Community Guide →] [Search →]  │
└──────────────────────────────────────────────────────────────┘
```

**Files involved:**
- `blog/post.html` — `renderCityLinkCard()` function + `#cityLinkCard` placeholder div
- `lib/blog-sanity.ts` — `getPostBySlug()` returns `city` field
- `api/blog/post.ts` — proxies the Sanity query (no change needed)

---

### Community Page → Blog Posts

Each of the 9 community pages automatically shows a **"From the Blog"** section that populates with up to 3 recent blog posts tagged with that city.

The section is injected dynamically **before `#community-cta`** by a shared script included on every community page.

**How it works:**
1. `/blog/community-posts.js` is included on all 9 community pages (added with `defer`)
2. The script detects the current city from the URL pathname (e.g. `/la-quinta.html` → `la-quinta`)
3. Queries Sanity CDN: `*[_type=="blogPost" && city=="la-quinta"] | order(publishedAt desc)[0...3]`
4. If posts are found, inserts the section. If none, does nothing silently — the page looks unchanged until posts exist.

**Files involved:**
- `blog/community-posts.js` — shared IIFE script
- `community.css` — `#community-blog-posts`, `.cbp-*` styles
- All 9 community pages — `<script src="/blog/community-posts.js" defer></script>`

**Note:** The section only appears once blog posts tagged to that city have been published. Existing posts published before this feature was added will not appear — only new posts going forward.

---

### Sanity `blogPost` Schema — `city` Field

```typescript
city?: string  // one of the 9 city slugs above, or absent for general CV posts
```

Written at publish time by `publishBlogPost()` in `lib/blog-sanity.ts`. Read by:
- `getPostBySlug()` — for blog post pages (community link card)
- Community pages — via direct Sanity CDN query in `community-posts.js`

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
  city?: string,                    // city slug e.g. 'palm-springs' — absent for general CV posts
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
| `api/blog/publish-custom.ts` | Custom publish endpoint — accepts raw article objects, bypasses Redis daily cache |
| `api/blog/inject-articles.ts` | Merge custom articles into today's daily Redis store (used by event publisher) |
| `api/blog/articles.ts` | Returns stored daily articles from Redis |
| `api/blog/weekly-topics.ts` | Returns stored weekly topics from Redis |
| `admin/blog-picker/index.html` | Daily article selection UI — category tabs: Market Updates, Investor Tips, Seller Tips, Local Happenings, Trending Topics |
| `admin/weekly-picker/index.html` | Weekly topic selection UI (category tabs) |
| `admin/event-publisher/index.html` | Curated event articles — injects into daily store, redirects to blog picker |
| `blog/index.html` | Blog listing — fetches from Sanity CDN, category filter |
| `blog/post.html` | Individual blog post — reads `?slug=` param |

### Cron Schedule (`vercel.json`)
| Schedule | Route | What it does |
|---|---|---|
| `0 13 * * *` (6 AM PT daily) | `/api/cron/research` | Daily news research + digest email to Shana |
| `0 3 * * 0` (8 PM PT Saturday) | `/api/cron/weekly` | Weekly topic generation + Sunday digest email |
