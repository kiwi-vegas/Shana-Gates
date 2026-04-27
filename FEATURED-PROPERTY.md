# Featured Property System — Complete Reference

A magazine-style **Featured Properties carousel** on the homepage and a dedicated **single-property landing page** for each listing. Both views are driven from one source of truth so adding a new property is a 5-step procedure with no risk of fields drifting out of sync. Designed to be portable to any branded real-estate site (replication notes at the bottom).

---

## Table of contents

1. [Architecture at a glance](#architecture-at-a-glance)
2. [Source-of-truth JSON schema](#source-of-truth-json-schema)
3. [Homepage carousel](#homepage-carousel)
4. [Single-property landing page](#single-property-landing-page)
5. [Add a new featured property — the 5-step workflow](#add-a-new-featured-property--the-5-step-workflow)
6. [Mark a property sold or remove it](#mark-a-property-sold-or-remove-it)
7. [Carousel without a detail page (partial-data fallback)](#carousel-without-a-detail-page-partial-data-fallback)
8. [Replicating this system on a different client's site](#replicating-this-system-on-a-different-clients-site)

---

## Architecture at a glance

```
data/featured-properties.json     ← single source of truth (one entry per property)
properties/_template.html         ← copy this when adding a new property
properties/{slug}.html            ← per-property landing page (auto-bound to JSON)
images/properties/{slug}/         ← per-property photos: hero.jpg + 01.jpg, 02.jpg…
index.html (#featured-properties) ← homepage carousel reads the JSON
community.css                     ← shared styles for the property detail pages
```

The homepage carousel and the per-property pages both `fetch('/data/featured-properties.json')` at runtime and bind their content from the matching entry. **No build step.** Edit the JSON, drop in photos, push to git, Vercel deploys.

---

## Source-of-truth JSON schema

`data/featured-properties.json` is an array of property objects. Each entry follows this schema:

```jsonc
{
  // Required
  "slug": "4321-lumina-way",                  // kebab-case from address; unique
  "address": "4321 Lumina Way",
  "city": "Palm Springs",
  "state": "CA",
  "heroImage": "/images/properties/4321-lumina-way/hero.jpg",
  "status": "active",                          // "active" or "sold"; only "active" appears in the carousel

  // Strongly recommended
  "zip": "92262",
  "lat": 33.8360,                              // for the location map (Google "address lat lng")
  "lng": -116.4991,
  "neighborhood": "Escena Golf Club",          // shown in the title block locality line
  "communitySlug": "palm-springs",             // matches a community page (palm-springs, palm-desert, etc.)
  "tagline": "One short italic line shown if no description is set.",
  "description": "Long marketing copy, 2–4 paragraphs. Becomes the body of the detail page and a 240-char excerpt becomes the hover-card text.",
  "features": [                                // 8–15 distinctive features, no generic stuff
    "Walls of glass on the great room",
    "18-panel solar array",
    "Tesla Powerwall battery backup"
  ],
  "gallery": [                                 // primary hero plus optional additional photos for the detail page
    "/images/properties/4321-lumina-way/hero.jpg",
    "/images/properties/4321-lumina-way/01.jpg"
  ],

  // Listing facts (recommended for full effect)
  "price": 1695000,
  "priceDisplay": "$1,695,000",                // human-formatted; what the cards/detail show
  "beds": 3,
  "baths": 3,
  "sqft": 2593,
  "lotSize": "6,970 sq ft",
  "yearBuilt": 2023,
  "mls": "26648853PS",
  "ylopoDetailUrl": "https://search.searchcoachellavalleyhomes.com/search/detail/259492317",

  // Detail-page routing
  "hasDetailPage": true,                       // true → "Learn More" goes to /properties/{slug}.html
                                                // false → "Learn More" goes to ylopoDetailUrl

  // Optional: time-sensitive markers (both fields are independent)
  "priceCut": {
    "amount": 50000,
    "amountDisplay": "$50,000",
    "previousPriceDisplay": "$1,745,000",
    "dateDisplay": "February 2026"
  },
  "openHouse": {
    "displayDate": "Saturday, May 2",
    "displayTime": "12:00 – 3:00 PM",
    "displayShort": "Sat May 2 · 12–3 PM"     // compact form used in the carousel hover pill
  },

  // Optional: attribution
  "listedBy": {
    "agent": "Shana Gates",
    "brokerage": "Craft & Bauer | Real Broker"
  }
}
```

### Field requirements

| Use case | Required fields |
|---|---|
| Carousel slide only (link out to YLOPO) | `slug`, `address`, `city`, `state`, `heroImage`, `status: "active"`, `ylopoDetailUrl`, `hasDetailPage: false` |
| Carousel slide + dedicated detail page | All of the above PLUS `lat`, `lng`, `description`, `features`, `hasDetailPage: true` — and a corresponding `properties/{slug}.html` file |
| With price cut indicator | `priceCut` object |
| With open house indicator | `openHouse` object |

---

## Homepage carousel

Lives in `index.html` under `<section id="featured-properties">`. Inline CSS + inline JS — no external file load, all rules live in the homepage `<style>` block (community.css is not linked from `index.html`, this is intentional so the homepage stays self-contained).

### Behavior

- Full-width carousel, ~80vh tall, dark backdrop
- One slide per `status: "active"` property in the JSON
- Prev/next arrow controls (deep teal `#25434B` on hover)
- Dot indicators below the slide, one per slide
- Arrow-key navigation when the section is in view
- No autoplay — manual only
- Crossfade transition between slides (350ms)

### Two visual states per slide

**Default (resting):** Clean text overlay in the bottom-left of the photo:
- "FEATURED LISTING" eyebrow (small caps, white)
- Address (large uppercase serif, white)
- Inline stats line: `$1,695,000  |  3 Beds  |  3 Baths  |  2,593 Sq.Ft.` (italic serif, white)
- "LEARN MORE" outlined button on the bottom-right
- Subtle bottom-edge gradient on the photo for legibility

**On hover (or focus):** The simple text fades out and a two-tone card slides up:
- **Cream column (left):** Optional teal "Open House" pill at top, then the description excerpt (italic serif, dark text)
- **Dark column (right):** Price (large) → optional amber "↓ $X price reduction · {date}" line → Beds → Baths → Sq.Ft. (each with right-aligned italic label and bronze underline separator)

Mobile (< 900px): hover card hidden — the simple text overlay stays visible. Tapping the slide goes straight to the detail page via the LEARN MORE button.

### What controls whether the hover card renders

The slide gets a `.has-hover` class when there's something meaningful to show. The card appears whenever a description (or tagline fallback) exists. If the property has no description AND no tagline, the slide stays as default-only.

---

## Single-property landing page

URL: `/properties/{slug}.html`. Each page is generated by copying `properties/_template.html` and editing two lines (the `<title>` and the `window.PROPERTY_SLUG` value). All other content binds from the JSON entry by slug at runtime.

### Section order

1. **Nav** — same sticky nav as community pages
2. **Hero gallery** — full-width, swipeable, prev/next arrows + photo counter (`1 / 12`); shows `hero.jpg` if no gallery yet
3. **Open House banner** — full-width teal banner above the title block, only renders when `openHouse` is present
4. **Attribution line** — "Featured by Shana Gates · Craft & Bauer | Real Broker"
5. **Title block** — address (serif H1) + locality line (neighborhood · city, state zip · MLS#) + price (right-aligned). Below the price, an amber "↓ $X price reduction · {date} (was $Y)" line renders if `priceCut` is set.
6. **Stats** — Beds · Baths · Living Area · Lot · Built (each a stat block with bold value + italic label)
7. **Description** — narrative copy from `description` (paragraphs split on blank lines)
8. **Features** — 2-column bulleted list with bronze checkmarks (only renders if `features.length > 0`)
9. **Location map** — Mapbox map centered on `lat`/`lng` (zoom 14, Standard/night style, single bronze marker pin). Lazy-initialized on scroll into view.
10. **Neighborhood card** — links to the relevant `/{communitySlug}.html` community page
11. **Schedule a Showing CTA** — Shana's photo, name, "Request a Tour" mailto button (subject pre-filled with the property address), call button
12. **Other Featured Listings** — horizontal scrollable strip of all other active properties (see below)
13. **Footer** — MLS-disclosure footer

### "Other Featured Listings" — horizontal scroll behavior

- Renders ALL other active properties from `featured-properties.json` (no `.slice(3)` cap)
- Native horizontal scroll with CSS `scroll-snap-type: x mandatory`
- Custom thin bronze scrollbar
- Prev/next arrow buttons appear automatically when the content overflows the visible area; hidden when everything fits
- Each arrow scrolls by one card-width (+ gap)
- Arrows disable at the start/end of the scroll
- Cards visible at once: 3 desktop · 2 tablet · 1.25 mobile (peek of next card)
- Mobile: arrow buttons hidden — touch swipe handles it

### Data binding flow

```
Page load → window.PROPERTY_SLUG = '<slug>'  (set by 1-line script in <head>)
         → fetch('/data/featured-properties.json')
         → find entry where slug === PROPERTY_SLUG
         → fill in addresses / price / stats / description / features / map / others / etc by element ID
```

Element IDs used by the binding script (don't rename without updating the JS):
`pp-address`, `pp-locality`, `pp-price`, `pp-pricecut`, `pp-openhouse-banner`, `pp-openhouse-when`, `pp-stats`, `pp-body`, `pp-features-list`, `pp-features-section`, `pp-map`, `pp-neighborhood-section`, `pp-neighborhood-title`, `pp-neighborhood-link`, `pp-tour-mailto`, `pp-others-section`, `pp-others-grid`, `pp-others-prev`, `pp-others-next`, `pp-hero-track`, `pp-counter`, `pp-prev`, `pp-next`.

---

## Add a new featured property — the 5-step workflow

### 1. Drop photos into `/images/properties/{slug}/`

Use a kebab-case slug from the address.

```
images/properties/123-mountain-view-drive/
  hero.jpg          ← 1600×1000+ JPEG, < 400 KB after compression. Used as the carousel hero.
  01.jpg            ← gallery photo 1 (shown on the detail page)
  02.jpg
  …                 ← 8–15 total recommended; you can ship with just hero.jpg first and add more later
```

If you only have one photo at first, drop just `hero.jpg`. The detail page gallery falls back to the hero, prev/next arrows hide automatically. Add more photos later — just reference them in the JSON `gallery` array.

### 2. Add an entry to `data/featured-properties.json`

Append to the array using the schema above. The minimum-viable carousel-only entry is `slug + address + city + state + heroImage + status + ylopoDetailUrl + hasDetailPage: false`. For a full detail page, also include `lat`, `lng`, `description`, `features`, `priceDisplay`, `beds`, `baths`, `sqft`, and flip `hasDetailPage: true`.

### 3. Copy the template

```bash
cp properties/_template.html properties/123-mountain-view-drive.html
```

(Skip this step if `hasDetailPage: false`.)

### 4. Edit two lines

Open `properties/123-mountain-view-drive.html` and change:

```html
<title id="pp-title">Featured Listing — Shana Gates</title>
```

→

```html
<title id="pp-title">123 Mountain View Drive · Palm Desert — Shana Gates</title>
```

And:

```html
<script>window.PROPERTY_SLUG = '__SLUG__';</script>
```

→

```html
<script>window.PROPERTY_SLUG = '123-mountain-view-drive';</script>
```

### 5. Commit + push

```bash
git add data/featured-properties.json images/properties/123-mountain-view-drive properties/123-mountain-view-drive.html
git commit -m "Add featured property: 123 Mountain View Drive"
git push
```

Vercel auto-deploys. The new property appears on the homepage carousel and at `/properties/123-mountain-view-drive.html`.

---

## Mark a property sold or remove it

- **Sold:** flip `"status": "active"` → `"status": "sold"`. The carousel skips it. The detail page still loads (good for backlinks/SEO history).
- **Remove entirely:** delete the JSON entry, the `properties/{slug}.html` file, and the `images/properties/{slug}/` folder.

---

## Carousel without a detail page (partial-data fallback)

Useful when you don't have full marketing copy yet — feature the property on the homepage now, route the "Learn More" button to YLOPO until full data is ready.

In the JSON entry:
- Set `"hasDetailPage": false`
- Skip `description`, `features`, `lat`, `lng`
- Provide at minimum: `slug`, `address`, `city`, `state`, `heroImage`, `ylopoDetailUrl`, `status: "active"`, `tagline`

The carousel renders with whatever stats are present (e.g. just price if that's all you have, or just "Active Listing" + city as a fallback). The "Learn More" button becomes "View on MLS" and opens the YLOPO detail in a new tab. Upgrade later by adding the missing fields, flipping `hasDetailPage: true`, and creating `properties/{slug}.html` from the template.

---

## Replicating this system on a different client's site

Everything in this feature is portable. Copy these files to the new repo, then do a find-and-replace pass:

| File | Action |
|---|---|
| `data/featured-properties.json` | Empty the array (or use it for the new client's properties from day one) |
| `properties/_template.html` | Update the nav block (logo, dropdown items, links), agent contact details (mailto, tel, photo), and footer text |
| `index.html` (`#featured-properties` block) | Replace just the `<section id="featured-properties">` block — both the markup and the inline `<style>` carousel rules and the inline `<script>` that fetches the JSON. Anchor link `/#featured-properties` continues to work. |
| `community.css` | Drop in unchanged — the property-page styles live here and are framework-agnostic |
| `community-map.js` | If you're using single-property maps too, the existing `window.PROPERTY_MAP_CONFIG` branch needs no changes; the Mapbox token in the file should be replaced with the new client's URL-restricted public token |

### What's brand-specific and needs to be customized

1. **Color tokens** in the new client's `:root`:
   - `--bronze` (Shana: `#B8975A`) → new client's accent color
   - `--cream` (Shana: `#F2EDE4`) → cream/light backdrop on the hover-card tagline column
   - `--dark` (Shana: `#0d0d0d`) → site-wide dark backdrop
   - The arrow hover color is hardcoded in two places — `index.html` `.fp-arrow:hover { background: #25434B; ... }` and `community.css` `.pp-others-arrow:hover` and `.pp-openhouse-banner` background. Search for `#25434B` and replace.

2. **Fonts** in `:root`:
   - `--serif` (Shana: `Cormorant Garamond`) — used for addresses, prices, descriptions
   - `--sans` (Shana: `Jost`) — used for eyebrows, buttons, labels
   - Both need to be loaded via `<link>` in the page head

3. **YLOPO domain** in JSON's `ylopoDetailUrl` fields — replace with the new agent's `search.{domain}.com`

4. **Agent attribution** in `_template.html` — change "Featured by Shana Gates · Craft & Bauer | Real Broker"

5. **Mailto / tel / photo** in `_template.html` — change `shana@craftbauer.com`, `7602324054`, `/images/shana%20pro.JPG`

6. **Community pages** — the neighborhood card on the detail page links to `/{communitySlug}.html`. The new client needs corresponding pages, or you can change the link target.

### What's portable as-is

- Carousel JS logic (slide management, hover state, keyboard nav, arrow controls)
- Property-page data binding (JSON-driven)
- Open House banner + Price Cut indicator schema
- Horizontal-scroll Other-Featured-Listings strip with snap + arrows
- Mobile responsive breakpoints
- The 5-step add-a-property workflow

---

## Quick reference

- Add a property: 5-step workflow above
- Toggle sold: change `status` field
- Add price cut: add `priceCut` object to JSON entry
- Add open house: add `openHouse` object to JSON entry
- Change arrow color: search `#25434B` across `index.html` + `community.css`
- Customize attribution: edit the line in `_template.html` then regenerate detail pages from template (or edit each detail file directly — they're static after the two-line edit so manual edits work)
