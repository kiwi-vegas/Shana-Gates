# YLOPO Click Attribution — Setup & Reference

## What It Does

`ylopo-tracking.js` intercepts every click on a YLOPO IDX listing widget across `shanasells.com` and:

1. **Fires a GA4 custom event** (`idx_property_click`) with the originating page, section, and destination URL
2. **Appends UTM parameters** to the YLOPO URL so the traffic shows as referred in YLOPO's analytics

This proves which pages and content on the site are generating actual buyer engagement with listings.

---

## Pages Covered

The script runs on all 11 pages that embed YLOPO widgets:

- `index.html` — Homepage
- `palm-springs.html` through `coachella.html` — All 9 city community pages
- `blog/post.html` — Individual blog posts (related listings widget)

---

## GA4 Event Spec

**Event name:** `idx_property_click`

| Parameter | Type | Example |
|---|---|---|
| `page_slug` | string | `palm-springs` |
| `page_path` | string | `/palm-springs.html` |
| `widget_section` | string | `results-widget` or a section `id` |
| `destination_url` | string | Full YLOPO listing URL |
| `click_text` | string | Visible text on the clicked element (truncated to 100 chars) |

---

## UTM Parameters Added to YLOPO Links

| Parameter | Value |
|---|---|
| `utm_source` | `website` |
| `utm_medium` | `idx` |
| `utm_campaign` | page slug (e.g. `palm-springs`) |
| `utm_content` | `ylopo-widget` |

---

## One-Time GA4 Setup (operator, do this once)

### 1 — Register Custom Dimensions

In GA4 (`G-B0SJ1F6PDN`): **Admin → Custom definitions → Create custom dimension**

| Dimension name | Event parameter | Scope |
|---|---|---|
| Page Slug | `page_slug` | Event |
| Widget Section | `widget_section` | Event |
| Destination URL | `destination_url` | Event |

### 2 — Create a Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → IAM & Admin → Service Accounts
2. Create a new service account (name it e.g. `shanasells-ga4-reader`)
3. No Cloud IAM roles needed at this step
4. Create a JSON key → download the file

### 3 — Grant the Service Account Access to GA4

1. In GA4: **Admin → Account Access Management → Add users**
2. Enter the service account email (looks like `name@project.iam.gserviceaccount.com`)
3. Role: **Viewer**

### 4 — Add Vercel Environment Variables

| Variable | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The full contents of the downloaded JSON key file (paste as a single-line string) |
| `GOOGLE_ANALYTICS_PROPERTY_ID` | The **numeric** property ID from GA4 → Admin → Property Settings (e.g. `12345678`, NOT `G-...`) |

Once both are set and Vercel redeploys, the dashboard at `/admin/blog-dashboard/` will show Site Traffic and YLOPO Attribution sections.

---

## Verifying Events Work

**Option A — GA4 DebugView (recommended)**

1. Open any community page in Chrome
2. Open DevTools → Console, paste: `document.cookie += '; _ga_debug=1'`
3. Or install the [Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger) extension
4. Click any listing card
5. In GA4: Admin → DebugView → look for `idx_property_click`

**Option B — Console check**

Open DevTools, click a listing — you won't see a console.log since the script is silent, but you can temporarily add one by editing `ylopo-tracking.js`:

```javascript
// Add after the fireEvent() call:
console.log('[ylopo-tracking] idx_property_click', { page_slug: slug, section })
```

**Option C — UTM verification**

Click any listing. The URL that opens in the YLOPO tab should contain:
```
?utm_source=website&utm_medium=idx&utm_campaign=palm-springs&utm_content=ylopo-widget
```

---

## File Reference

| File | Purpose |
|---|---|
| `ylopo-tracking.js` | The tracking script — event delegation, GA4 event, UTM rewrite |
| `lib/ga4-client.ts` | Server-side GA4 Data API client — JWT auth, `runGA4Report()` |
| `api/blog/dashboard.ts` | Dashboard API — now calls GA4 for site traffic + YLOPO click data |
| `admin/blog-dashboard/index.html` | Dashboard UI — Site Traffic + YLOPO Attribution sections |

---

## How It Works (Technical)

YLOPO widgets render asynchronously — DOM elements don't exist at page load. The script uses **event delegation** on `document` in capture phase (`{ capture: true }`), which fires before any handler lower in the DOM tree, including YLOPO's own click handlers. This works for any YLOPO link that exists now or in the future without needing `MutationObserver`.

The GA4 Data API calls use a raw `fetch()` + WebCrypto JWT approach — no SDK. The service account's private key is imported via `crypto.subtle.importKey` and the JWT is signed client-side in the Vercel serverless runtime (Node 18+).
