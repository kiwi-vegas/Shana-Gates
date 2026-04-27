# Featured Properties — Workflow

This site supports a magazine-style **Featured Properties carousel** on the homepage and a dedicated **single-property landing page** for each property. Both are driven from a single source of truth: [`data/featured-properties.json`](./data/featured-properties.json).

---

## Architecture at a glance

```
data/featured-properties.json     ← single source of truth (one entry per property)
properties/_template.html         ← copy this when adding a new property
properties/{slug}.html            ← per-property landing page (auto-bound to JSON)
images/properties/{slug}/         ← per-property photos: hero.jpg + 01.jpg, 02.jpg…
index.html (#featured-properties) ← homepage carousel reads the JSON
```

The homepage carousel and the single-property pages both `fetch('/data/featured-properties.json')` at runtime and bind their content from the matching entry. **There is no build step.** Edit the JSON, drop in photos, push to git, Vercel deploys.

---

## Add a new featured property — 5 steps

### 1. Drop photos into `/images/properties/{slug}/`

Use a kebab-case slug from the address (e.g. `4321-lumina-way`).

```
images/properties/123-mountain-view-drive/
  hero.jpg          ← 1600×1000+ JPEG, < 400 KB after compression. Used as the carousel hero.
  01.jpg            ← gallery photo 1 (shown on the detail page)
  02.jpg
  …                 ← 8–15 total recommended
```

If you only have one photo at first, that's fine — drop just `hero.jpg`. The detail page gallery falls back to the hero, and the prev/next arrows hide automatically. Add more photos later and they show up as soon as you reference them in the JSON.

### 2. Add an entry to `data/featured-properties.json`

Append to the array. Schema:

```jsonc
{
  "slug": "123-mountain-view-drive",          // kebab-case from address
  "address": "123 Mountain View Drive",
  "city": "Palm Desert",
  "state": "CA",
  "zip": "92211",
  "lat": 33.7602,                              // for the location map (Google "address lat lng")
  "lng": -116.2877,
  "neighborhood": "Bighorn Golf Club",         // optional; shown in title block
  "communitySlug": "palm-desert",              // matches a community page (palm-springs, palm-desert, etc.)
  "price": 2495000,
  "priceDisplay": "$2,495,000",                // human-formatted; shown on cards + detail
  "beds": 4,
  "baths": 4.5,
  "sqft": 3800,
  "lotSize": "0.45 acres",
  "yearBuilt": 2018,
  "mls": "26677788PS",
  "ylopoDetailUrl": "https://search.searchcoachellavalleyhomes.com/search/detail/...",
  "tagline": "One short italic line shown on the carousel card.",
  "description": "Long marketing copy for the detail page. Write 2–4 paragraphs (use blank lines to separate). This becomes the body of the page.",
  "features": [
    "Mountain views",
    "Chef's kitchen",
    "Heated pool",
    "Smart-home wiring",
    "3-car garage"
  ],
  "heroImage": "/images/properties/123-mountain-view-drive/hero.jpg",
  "gallery": [
    "/images/properties/123-mountain-view-drive/hero.jpg",
    "/images/properties/123-mountain-view-drive/01.jpg",
    "/images/properties/123-mountain-view-drive/02.jpg"
  ],
  "status": "active",                          // "active" or "sold" — only "active" appears in the carousel
  "hasDetailPage": true,                       // true → "Learn More" goes to /properties/{slug}.html
                                                // false → "Learn More" goes to ylopoDetailUrl
  "listedBy": {                                // optional; informational only
    "agent": "Shana Gates",
    "brokerage": "Craft & Bauer | Real Broker"
  }
}
```

**Required for a carousel slide to render:** `slug`, `address`, `city`, `state`, `heroImage`, `status: "active"`.

**Required additionally for a detail page:** `lat`, `lng`, `description`, `features` (recommended).

### 3. Copy the template

```bash
cp properties/_template.html properties/123-mountain-view-drive.html
```

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

That's the whole edit. Everything else binds automatically from the JSON entry.

### 5. Commit + push

```bash
git add data/featured-properties.json images/properties/123-mountain-view-drive properties/123-mountain-view-drive.html
git commit -m "Add featured property: 123 Mountain View Drive"
git push
```

Vercel auto-deploys. The new property appears in the homepage carousel and at `https://shanasells.com/properties/123-mountain-view-drive.html`.

---

## Marking a property as sold or removing it

- **Sold:** change `"status": "active"` to `"status": "sold"` in the JSON. The carousel will skip it. The detail page still loads (good for backlinks/SEO history).
- **Remove entirely:** delete the JSON entry, the `properties/{slug}.html` file, and the `images/properties/{slug}/` folder.

---

## Adding a new property as a carousel slide WITHOUT a detail page

Useful when you don't have full marketing copy yet — you can still feature the property on the homepage and route the "Learn More" button to the YLOPO MLS detail.

In the JSON:

- Set `"hasDetailPage": false`
- Skip `description`, `features`, `lat`, `lng`
- Provide at minimum: `slug`, `address`, `city`, `state`, `heroImage`, `ylopoDetailUrl`, `status: "active"`, `tagline`

The carousel will render with whatever stats are present (e.g. just price if that's all you have). The "Learn More" button becomes "View on MLS" and opens the YLOPO detail in a new tab. Upgrade to a full detail page later by adding the missing fields and creating `properties/{slug}.html`.

---

## Replicating this pattern for another client

The whole system is two files of code (`community.css` carousel rules + the inline JS in `index.html`'s `#featured-properties` section) plus the template. To port:

1. Copy `community.css` (already shared across the site)
2. Copy `properties/_template.html` and replace the nav block + agent contact
3. Copy `data/featured-properties.json` (rename or empty it for the new client)
4. Copy the homepage carousel block from `index.html` lines ~1622–1725 into the new client's homepage
5. Update YLOPO domains and Mapbox config in `community-map.js`

That's it.
