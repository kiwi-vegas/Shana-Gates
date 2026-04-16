# Shana Gates — Maps Reference

This file is the single source of truth for all Mapbox-powered maps on the site.
`CLAUDE.md` references this file for everything map-related.

---

## Overview

There are two types of maps on the site:

| Map | Pages | File |
|---|---|---|
| **Community maps** (hero + lifestyle) | All 9 community pages | `community-map.js` |
| **Valley overview map** | Homepage (`index.html`) | Inline in `index.html` |

Both use **Mapbox GL JS v3.4.0** with the **Standard style** and **night light preset**
for a consistent dark look with lit 3D buildings.

---

## Mapbox Credentials

| Item | Value |
|---|---|
| **Public token** | `pk.eyJ1IjoidmVnYXMta2l3aSIsImEiOiJjbW8waXJoaWEwOHN2MnJxYTl2bWNlaGp0In0.C57V2IUuHiNKHn5LLlbXog` |
| **Style** | `mapbox://styles/mapbox/standard` |
| **Light preset** | `night` (set via `map.setConfigProperty('basemap','lightPreset','night')`) |
| **GL JS version** | `3.4.0` |
| **CDN CSS** | `https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css` |
| **CDN JS** | `https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js` |
| **MCP server** | Configured in `~/.claude/settings.json` — token above, command: `npx -y @mapbox/mcp-server` |

The public token is safe to commit and ship in client-side code.

---

## Design Palette

| Element | Color | Usage |
|---|---|---|
| Bronze | `#B8975A` | City boundaries, Hwy 111 highlight, POI dots, hover fill |
| Blue | `#7dbfff` / `#5ba4ff` | I-10 freeway highlight |
| Glow opacity | `0.18–0.25` | Blur layer under road lines |
| Fill at rest | `0.07–0.10` opacity | City polygon fill (subtle tint) |
| Fill on hover | `0.38` opacity | City polygon fill (active state) |

---

## Major Valley Roads

Both map types render I-10 and Hwy 111 as GeoJSON LineString layers with a double-layer
technique: a blurred wide glow layer + a crisp narrow line on top.

### I-10 (east–west freeway, northern valley)

```js
[[-116.784,33.923],[-116.680,33.913],[-116.590,33.903],
 [-116.520,33.892],[-116.457,33.878],[-116.418,33.869],
 [-116.380,33.854],[-116.308,33.820],[-116.240,33.785],[-116.170,33.755]]
```

Glow layer: `#5ba4ff`, width 5–6, opacity 0.20–0.25, blur 4–5
Line layer: `#7dbfff`, width 2, opacity 0.70–0.75

### Highway 111 (commercial corridor, urban core)

```js
[[-116.550,33.822],[-116.520,33.812],[-116.468,33.803],
 [-116.415,33.742],[-116.385,33.723],[-116.328,33.716],
 [-116.301,33.708],[-116.243,33.720],[-116.175,33.705]]
```

Glow layer: `#B8975A` (bronze), width 5–6, opacity 0.18–0.20, blur 4–5
Line layer: `#B8975A` (bronze), width 2, opacity 0.60–0.65

---

## Community Pages — `community-map.js`

### How It Works

Each community page sets a `window.CV_MAP_CONFIG` object in an inline `<script>` tag,
then loads the shared `community-map.js` which reads that config and initializes both maps.

**Load order (bottom of each community page `<body>`):**

```html
<script src="https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js"></script>
<script>
  window.CV_MAP_CONFIG = { /* per-city config — see below */ };
</script>
<script src="/community-map.js"></script>
```

### `CV_MAP_CONFIG` Schema

```js
window.CV_MAP_CONFIG = {
  "city":         "La Quinta",           // Display name
  "subtitle":     "Coachella Valley, CA", // Sub-label (usually constant)
  "lng":          -116.3100,              // Map center longitude
  "lat":           33.6634,              // Map center latitude
  "heroZoom":      12.5,                 // Hero map zoom level
  "lifestyleZoom": 12.0,                 // Lifestyle map zoom level
  "boundary": [                          // Closed polygon [lng,lat] pairs
    [-116.385, 33.720], [-116.290, 33.720], ...
    [-116.385, 33.720]                   // First point repeated to close
  ],
  "pois": [                              // Points of interest (4–6 per city)
    {
      "name": "PGA West Stadium Course",
      "desc": "Host of The American Express PGA Tour",
      "lng": -116.2741,
      "lat":   33.6676,
      "icon": "⛳"                        // Emoji displayed as marker
    }
  ]
}
```

### Maps Created by `community-map.js`

| Map | Container | Zoom | Pitch | Bearing | Interactive |
|---|---|---|---|---|---|
| Hero | `#hero-map` | `heroZoom` (or 12) | 45° | −10° | No |
| Lifestyle | `#lifestyle-map` | `lifestyleZoom` (or 11.5) | 52° | −17° | Yes |

The lifestyle map is **lazy-loaded** via `IntersectionObserver` (threshold 0.1) — it
only initializes when scrolled into view, saving resources.

The lifestyle map also includes a `NavigationControl` (pitch + zoom) in the top-right.

### Layers Added to Every Community Map

1. `cv-i10-glow` / `cv-i10-line` — I-10 freeway (blue)
2. `cv-hwy111-glow` / `cv-hwy111-line` — Hwy 111 (bronze)
3. `cv-boundary-fill` / `cv-boundary-line` — city boundary polygon
4. POI markers — `.cv-map-poi` elements with emoji icons + dark popups
5. Corner label (lifestyle map only) — `.cv-map-label` bottom-left with city name

### CSS Classes (in `community.css`)

| Class | Purpose |
|---|---|
| `.cv-map-poi` | POI marker dot — 32px circle, bronze border, emoji icon |
| `.cv-map-label` | Corner label overlay — glassmorphism dark background |
| `.cv-poi-popup .mapboxgl-popup-content` | Dark glassmorphism popup override |
| `.cv-poi-name` / `.cv-poi-desc` | Popup text styles |

### Per-City Config Summary

| City | lng | lat | heroZoom | Notable POIs |
|---|---|---|---|---|
| Palm Springs | −116.5453 | 33.8303 | 11.5 | Aerial Tramway, Palm Canyon Drive, Art Museum, Airport |
| Palm Desert | −116.3744 | 33.7222 | 12.0 | El Paseo, CSUSB Palm Desert, Civic Center, Date Palm |
| Rancho Mirage | −116.4125 | 33.7395 | 12.5 | Agua Caliente Casino, Sunnylands, River, Eisenhower Health |
| Indian Wells | −116.3417 | 33.7175 | 13.0 | BNP Paribas Stadium, IW Hotel, Club at IW, Eldorado CC |
| La Quinta | −116.3100 | 33.6634 | 12.5 | PGA West, La Quinta Resort, Old Town, Coachella Valley Preserve |
| Indio | −116.2156 | 33.7206 | 12.0 | Empire Polo Club (Coachella), Riverside County Fair, Fantasy Springs, Date Festival |
| Cathedral City | −116.4653 | 33.7797 | 12.5 | Cathedral Canyon CC, Date Palm CC, City Hall, Agua Caliente DHS |
| Desert Hot Springs | −116.5014 | 33.9611 | 12.5 | Two Bunch Palms, Mission Lakes CC, Coachella Valley Mtns Conservancy, Hot Mineral Spring |
| Coachella | −116.1739 | 33.6803 | 12.5 | Agua Caliente Cultural Museum, Spotlight 29 Casino, Coachella Canal |

---

## Homepage Valley Overview Map

Located in `index.html` — shows all 9 communities at once, clickable to navigate.

### Container & Style

```js
new mapboxgl.Map({
  container: 'valley-map',
  style:     'mapbox://styles/mapbox/standard',
  center:    [-116.37, 33.785],
  zoom:       9.6,
  pitch:      0,        // flat overview — all 9 cities visible
  minZoom:    8,
  maxZoom:    14,
  attributionControl: false
})
// On load:
map.setConfigProperty('basemap', 'lightPreset', 'night')
map.fitBounds([[-116.68,33.56],[-116.08,34.02]], { padding: 60, duration: 0 })
```

### Layers

1. `val-i10-glow` / `val-i10-line` — I-10 (blue, same coords as above)
2. `val-hwy111-glow` / `val-hwy111-line` — Hwy 111 (bronze, same coords)
3. Per city: `[id]-fill` + `[id]-line` — boundary polygon with hover state
4. City label markers (`.valley-city-label`) with bronze dot + name text

### Interactive Behavior

- Hover over a city polygon → tooltip appears (city number, name, tag)
- Hover state changes fill opacity from 0.09 → 0.38 and line from 0.60 → 1.0
- Click a polygon or label → navigates to that city's page
- Touch (mobile) → tap-to-navigate

### Road Legend

A small `.map-road-legend` overlay in the bottom-left labels the two road highlights:
- Blue line — I-10
- Bronze line — Hwy 111

---

## City Boundary Polygons — All 9 Cities

Used by both the homepage overview map and individual community maps.

```js
// Palm Springs
[[-116.635,33.885],[-116.510,33.885],[-116.488,33.862],[-116.484,33.800],
 [-116.505,33.773],[-116.560,33.772],[-116.630,33.796],[-116.645,33.840],[-116.635,33.885]]

// Palm Desert
[[-116.452,33.782],[-116.362,33.782],[-116.295,33.754],[-116.285,33.700],
 [-116.305,33.660],[-116.382,33.648],[-116.458,33.668],[-116.470,33.726],[-116.452,33.782]]

// Rancho Mirage
[[-116.462,33.774],[-116.400,33.776],[-116.358,33.764],[-116.342,33.732],
 [-116.350,33.710],[-116.400,33.703],[-116.462,33.712],[-116.480,33.742],[-116.462,33.774]]

// Indian Wells
[[-116.372,33.740],[-116.330,33.741],[-116.300,33.732],[-116.290,33.713],
 [-116.298,33.700],[-116.330,33.694],[-116.370,33.700],[-116.383,33.718],[-116.372,33.740]]

// La Quinta
[[-116.385,33.720],[-116.290,33.720],[-116.247,33.700],[-116.238,33.635],
 [-116.260,33.595],[-116.313,33.585],[-116.375,33.608],[-116.395,33.658],[-116.385,33.720]]

// Indio
[[-116.305,33.773],[-116.180,33.773],[-116.130,33.750],[-116.120,33.700],
 [-116.140,33.660],[-116.192,33.648],[-116.285,33.655],[-116.315,33.700],[-116.305,33.773]]

// Cathedral City
[[-116.512,33.815],[-116.454,33.818],[-116.420,33.803],[-116.402,33.773],
 [-116.410,33.750],[-116.450,33.742],[-116.502,33.752],[-116.522,33.780],[-116.512,33.815]]

// Desert Hot Springs
[[-116.558,33.998],[-116.475,33.998],[-116.445,33.975],[-116.438,33.940],
 [-116.458,33.918],[-116.500,33.915],[-116.548,33.935],[-116.568,33.968],[-116.558,33.998]]

// Coachella
[[-116.228,33.712],[-116.147,33.712],[-116.118,33.698],[-116.112,33.665],
 [-116.130,33.638],[-116.178,33.628],[-116.228,33.638],[-116.248,33.670],[-116.228,33.712]]
```

---

## How to Add a New POI

Edit the `pois` array inside `window.CV_MAP_CONFIG` in the relevant community page.
Each POI needs: `name`, `desc`, `lng`, `lat`, `icon` (emoji).

```js
{ "name": "New Landmark", "desc": "Short description", "lng": -116.XXX, "lat": 33.XXX, "icon": "🏌️" }
```

`community-map.js` renders all POIs automatically — no JS changes needed.

---

## How to Update a City Boundary

Replace the `boundary` array in `window.CV_MAP_CONFIG` on the relevant page.
The polygon must be **closed** (last point = first point) and use `[lng, lat]` order.
The same boundary is displayed on both the hero map and the lifestyle map.

The homepage overview map has its own copy of the boundaries inside the `COMMUNITIES`
array in `index.html` — update both if the boundary changes.

---

## Ideas for Future Map Features

Things worth building as the site grows:

- **Neighborhood sub-zones** — draw smaller polygons inside a city (e.g. Movie Colony vs
  Deepwell in Palm Springs) with separate hover labels
- **Listing heat map** — pull live listing counts from YLOPO or MLS and show as a
  color-intensity layer over each community
- **Drive-time isochrones** — show 30/60-min drive rings from Palm Springs airport using
  the Mapbox Isochrone API — useful for snowbird buyer context
- **Terrain layer** — enable the Standard style terrain exaggeration to show the San
  Jacinto Mountains rising dramatically behind Palm Springs
- **3D building pitch on community maps** — the Standard style already renders 3D
  buildings; increasing pitch on the lifestyle map to 60° would make them more dramatic
- **Custom map style** — a Mapbox Studio style tuned to the site's bronze/dark palette
  (custom road colors, custom label fonts matching the site's Jost/Cormorant combo)
- **Sold listings layer** — toggle showing recent sold transactions as dots on the
  lifestyle map (sourced from a Sanity dataset or a nightly data pull)
- **Street View integration** — clicking a POI opens a Google Street View panel in a
  modal alongside the map
- **Salton Sea label** — add a static label marker for the Salton Sea on the valley
  overview map to help orient visitors unfamiliar with the geography
- **I-10 exit labels** — small text markers for key freeway exits (Date Palm Dr,
  Monterey Ave, Washington St) to help relocating buyers understand the corridor
