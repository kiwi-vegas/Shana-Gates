/**
 * api/blog/post-page.ts
 * Serves /blog/post/:slug with server-rendered Open Graph meta tags so
 * social media crawlers (Facebook, LinkedIn, Twitter/X, iMessage, Slack)
 * pick up the post title, excerpt, and hero image thumbnail.
 *
 * Vercel rewrites /blog/post/:slug → /api/blog/post-page?slug=:slug
 *
 * Humans get the same JS-rendered post experience as blog/post.html.
 * Crawlers read the OG tags in <head> without executing JavaScript.
 */

import { getPostBySlug } from '../../lib/blog-redis'

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).end()

  const slug = (req.query?.slug as string) || ''
  if (!slug) return res.status(400).end()

  const post = await getPostBySlug(slug)

  if (!post) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(404).send(`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Post Not Found — Shana Gates Blog</title>
<style>body{background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;}</style>
</head><body>
<div><h1 style="color:#B8975A;margin-bottom:16px">Post Not Found</h1>
<p style="color:rgba(255,255,255,0.5);margin-bottom:24px">This post may have been moved or removed.</p>
<a href="/blog/" style="color:#B8975A">← Back to Blog</a></div>
</body></html>`)
    return
  }

  const canonicalUrl = `https://shana-gates.vercel.app/blog/post/${esc(slug)}`
  const imageTag = post.heroImageUrl
    ? `
  <meta property="og:image"        content="${esc(post.heroImageUrl)}" />
  <meta property="og:image:width"  content="1280" />
  <meta property="og:image:height" content="720" />
  <meta name="twitter:image"       content="${esc(post.heroImageUrl)}" />`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-B0SJ1F6PDN"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-B0SJ1F6PDN');
</script>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>${esc(post.title)} — Shana Gates</title>
  <meta name="description" content="${esc(post.excerpt)}" />

  <!-- Open Graph -->
  <meta property="og:type"        content="article" />
  <meta property="og:site_name"   content="Shana Gates Real Estate" />
  <meta property="og:title"       content="${esc(post.title)}" />
  <meta property="og:description" content="${esc(post.excerpt)}" />
  <meta property="og:url"         content="${canonicalUrl}" />${imageTag}

  <!-- Twitter / X -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${esc(post.title)}" />
  <meta name="twitter:description" content="${esc(post.excerpt)}" />

  <link rel="canonical" href="${canonicalUrl}" />
  <link rel="icon" type="image/png" href="/images/favcon.png" />

  <!-- marked.js for markdown rendering -->
  <script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>

  <!-- Slug injected server-side so JS doesn't need to parse the URL -->
  <script>window.PAGE_SLUG = '${esc(slug)}';</script>

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bronze: #B8975A;
      --bg: #0a0a0a;
      --surface: #141414;
      --border: rgba(255,255,255,0.08);
      --text: #fff;
      --muted: rgba(255,255,255,0.45);
      --font: system-ui, -apple-system, sans-serif;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      -webkit-font-smoothing: antialiased;
    }

    /* ── Nav ── */
    nav {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(10,10,10,0.92);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 0 32px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .nav-logo {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      flex-shrink: 0;
    }
    .nav-logo img { height: 44px; width: auto; display: block; object-fit: contain; }
    .nav-links { display: flex; align-items: center; gap: 28px; list-style: none; }
    .nav-links li { list-style: none; }
    .nav-links a {
      color: var(--muted);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      transition: color 0.15s;
    }
    .nav-links a:hover, .nav-links a.active { color: var(--bronze); }
    .nav-communities { position: relative; }
    .nav-communities-trigger {
      display: flex; align-items: center; gap: 5px; cursor: pointer;
      font-size: 13px; font-weight: 500; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--muted);
    }
    .nav-communities-trigger::after { content: '▾'; font-size: 10px; color: rgba(255,255,255,0.3); }
    .communities-dropdown {
      position: absolute; top: calc(100% + 18px); left: 50%;
      background: rgba(19,19,19,0.98); border: 1px solid rgba(184,151,90,0.2);
      min-width: 200px; opacity: 0; pointer-events: none;
      transition: opacity 0.25s, transform 0.25s;
      transform: translateX(-50%) translateY(-6px); z-index: 150;
    }
    .communities-dropdown::before {
      content: ''; position: absolute; top: -18px; left: 0; right: 0; height: 18px;
    }
    .nav-communities:hover .communities-dropdown {
      opacity: 1; pointer-events: all; transform: translateX(-50%) translateY(0);
    }
    .communities-dropdown a {
      display: block; padding: 10px 18px; font-size: 11px; font-weight: 400;
      letter-spacing: 0.15em; text-transform: uppercase;
      color: rgba(255,255,255,0.65); text-decoration: none;
      border-bottom: 1px solid rgba(184,151,90,0.08);
      transition: color 0.2s, background 0.2s;
    }
    .communities-dropdown a:last-child { border-bottom: none; }
    .communities-dropdown a:hover { color: var(--bronze); background: rgba(184,151,90,0.06); }
    .nav-cta {
      background: var(--bronze);
      color: #000;
      padding: 8px 20px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
    }

    /* ── Loading skeleton ── */
    .post-loading {
      max-width: 760px;
      margin: 60px auto;
      padding: 0 32px;
    }
    .sk { background: #1e1e1e; border-radius: 6px; animation: shimmer 1.5s ease-in-out infinite; }
    .sk-hero { width: 100%; aspect-ratio: 16/9; margin-bottom: 40px; border-radius: 12px; }
    .sk-line { height: 14px; margin-bottom: 12px; }
    .sk-line.wide { width: 100%; }
    .sk-line.medium { width: 70%; }
    .sk-line.narrow { width: 40%; }
    .sk-title { height: 44px; width: 90%; margin-bottom: 24px; }
    @keyframes shimmer { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }

    /* ── Post layout ── */
    .post-wrap {
      max-width: 760px;
      margin: 0 auto;
      padding: 0 32px 80px;
      display: none;
    }

    .post-hero-image {
      width: 100%;
      aspect-ratio: 16/9;
      object-fit: cover;
      border-radius: 12px;
      margin: 40px 0;
      display: block;
    }

    .post-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .post-back {
      color: var(--muted);
      text-decoration: none;
      font-size: 13px;
      transition: color 0.15s;
    }
    .post-back:hover { color: var(--text); }
    .category-badge {
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 100px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .post-date { color: var(--muted); font-size: 13px; margin-left: auto; }

    /* ── Markdown body ── */
    .post-body {
      line-height: 1.8;
      font-size: 17px;
    }
    .post-body h1 {
      font-size: clamp(26px, 4vw, 38px);
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: -0.02em;
      margin-bottom: 28px;
      color: var(--text);
    }
    .post-body h2 {
      font-size: 22px;
      font-weight: 700;
      margin: 40px 0 16px;
      color: var(--text);
      padding-top: 8px;
      border-top: 1px solid var(--border);
    }
    .post-body p {
      margin-bottom: 20px;
      color: rgba(255,255,255,0.82);
    }
    .post-body ul, .post-body ol {
      margin: 0 0 20px 24px;
      color: rgba(255,255,255,0.82);
    }
    .post-body li { margin-bottom: 8px; }
    .post-body strong { color: var(--text); }
    .post-body em { color: var(--bronze); font-style: italic; }
    .post-body a { color: var(--bronze); }
    .post-body blockquote {
      border-left: 3px solid var(--bronze);
      padding-left: 20px;
      margin: 24px 0;
      color: var(--muted);
      font-style: italic;
    }
    .post-body img {
      max-width: 100%;
      height: auto;
      display: block;
      border-radius: 8px;
      margin: 32px auto 6px;
    }
    .post-body p:has(> img) { margin-bottom: 0; }
    .post-body p:has(> img) + p > em:only-child {
      display: block;
      font-size: 12px;
      color: var(--muted);
      font-style: normal;
      text-align: center;
      margin-bottom: 32px;
    }

    /* ── Source attribution ── */
    .source-credit {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 13px;
    }
    .source-credit a { color: var(--bronze); }

    /* ── Community link card ── */
    .city-link-card {
      margin-top: 32px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 28px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      flex-wrap: wrap;
    }
    .city-link-left .overline {
      color: var(--bronze);
      font-size: 11px;
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .city-link-left h3 { font-size: 18px; font-weight: 700; margin-bottom: 0; }
    .city-link-actions { display: flex; gap: 12px; flex-wrap: wrap; flex-shrink: 0; }
    .city-link-btn {
      display: inline-block;
      background: var(--bronze);
      color: #000;
      font-size: 14px;
      font-weight: 700;
      padding: 11px 22px;
      border-radius: 8px;
      text-decoration: none;
      transition: opacity 0.15s;
      white-space: nowrap;
    }
    .city-link-btn:hover { opacity: 0.85; }
    .city-link-btn-outline {
      display: inline-block;
      border: 1.5px solid rgba(184,151,90,0.5);
      color: var(--bronze);
      font-size: 14px;
      font-weight: 600;
      padding: 10px 22px;
      border-radius: 8px;
      text-decoration: none;
      transition: border-color 0.15s;
      white-space: nowrap;
    }
    .city-link-btn-outline:hover { border-color: var(--bronze); }
    @media (max-width: 640px) {
      .city-link-card { flex-direction: column; align-items: flex-start; }
      .city-link-actions { width: 100%; }
      .city-link-btn, .city-link-btn-outline { flex: 1; text-align: center; }
    }

    /* ── CTA card ── */
    .cta-card {
      margin-top: 48px;
      background: var(--surface);
      border: 1px solid rgba(184,151,90,0.25);
      border-radius: 12px;
      padding: 32px;
      text-align: center;
    }
    .cta-avatar {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      object-fit: cover;
      object-position: top center;
      border: 3px solid var(--bronze);
      display: block;
      margin: 0 auto 20px;
    }
    .cta-card .overline {
      color: var(--bronze);
      font-size: 11px;
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    .cta-card h3 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
    .cta-card p { color: var(--muted); font-size: 15px; margin-bottom: 24px; line-height: 1.6; }
    .cta-btn {
      display: inline-block;
      background: var(--bronze);
      color: #000;
      font-size: 15px;
      font-weight: 700;
      padding: 14px 32px;
      border-radius: 8px;
      text-decoration: none;
      transition: opacity 0.15s;
    }
    .cta-btn:hover { opacity: 0.85; }

    /* ── Equity links (auto-linked phrases about home value) ── */
    .equity-link { color: var(--bronze); text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px; }
    .equity-link:hover { text-decoration-style: solid; }

    /* ── YLOPO listings section ── */
    .listings-section {
      background: var(--surface);
      border-top: 1px solid var(--border);
      padding: 56px 32px 60px;
      margin-top: 0;
    }
    .listings-inner { max-width: 1100px; margin: 0 auto; }
    .listings-eyebrow {
      color: var(--bronze);
      font-size: 11px;
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .listings-heading { font-size: clamp(22px, 3vw, 30px); font-weight: 700; margin-bottom: 6px; }
    .listings-sub { color: var(--muted); font-size: 14px; margin-bottom: 28px; }
    .listings-view-all {
      display: inline-block;
      margin-top: 24px;
      background: transparent;
      border: 1.5px solid rgba(184,151,90,0.5);
      color: var(--bronze);
      font-size: 14px;
      font-weight: 600;
      padding: 10px 24px;
      border-radius: 8px;
      text-decoration: none;
      transition: border-color 0.15s;
    }
    .listings-view-all:hover { border-color: var(--bronze); }

    /* ── Back to blog ── */
    .back-bar {
      max-width: 760px;
      margin: 0 auto;
      padding: 24px 32px 0;
    }

    /* ── Footer ── */
    footer {
      border-top: 1px solid var(--border);
      padding: 32px;
      text-align: center;
      color: var(--muted);
      font-size: 13px;
      margin-top: 60px;
    }
    footer a { color: var(--bronze); text-decoration: none; }

    @media (max-width: 768px) {
      nav { padding: 0 16px; }
      .nav-links { display: none; }
      .post-wrap, .post-loading, .back-bar { padding-left: 16px; padding-right: 16px; }
      .post-body h1 { font-size: 26px; }
      .post-body h2 { font-size: 20px; }
      .post-body { font-size: 16px; }
    }
  </style>
</head>
<body>

  <nav>
    <a href="/" class="nav-logo">
      <img src="/images/C&amp;B-logo+R.png" alt="Shana Gates" />
    </a>
    <ul class="nav-links">
      <li class="nav-communities">
        <span class="nav-communities-trigger">Communities</span>
        <div class="communities-dropdown">
          <a href="/palm-springs.html">Palm Springs</a>
          <a href="/palm-desert.html">Palm Desert</a>
          <a href="/rancho-mirage.html">Rancho Mirage</a>
          <a href="/indian-wells.html">Indian Wells</a>
          <a href="/la-quinta.html">La Quinta</a>
          <a href="/indio.html">Indio</a>
          <a href="/cathedral-city.html">Cathedral City</a>
          <a href="/desert-hot-springs.html">Desert Hot Springs</a>
          <a href="/coachella.html">Coachella</a>
        </div>
      </li>
      <li><a href="/#featured-properties">Properties</a></li>
      <li><a href="/blog/">Blog</a></li>
      <li><a href="/#about">About Shana</a></li>
      <li><a href="/#search-listings">Search</a></li>
    </ul>
    <a href="tel:7602324054" class="nav-cta">760.232.4054</a>
  </nav>

  <div class="back-bar">
    <a href="/blog/" class="post-back">← Back to Blog</a>
  </div>

  <div class="post-loading" id="loadingState">
    <div class="sk sk-hero"></div>
    <div class="sk sk-line narrow"></div>
    <div class="sk sk-title sk"></div>
    <div class="sk sk-line wide"></div>
    <div class="sk sk-line wide"></div>
    <div class="sk sk-line medium"></div>
    <div class="sk sk-line wide"></div>
    <div class="sk sk-line wide"></div>
    <div class="sk sk-line narrow"></div>
  </div>

  <article class="post-wrap" id="postWrap">
    <div class="post-meta" id="postMeta"></div>
    <img id="heroImage" class="post-hero-image" style="display:none;" alt="" />
    <div class="post-body" id="postBody"></div>
    <div class="source-credit" id="sourceCredit" style="display:none;"></div>
    <div id="cityLinkCard" style="display:none;"></div>
    <div class="cta-card">
      <img class="cta-avatar" src="/images/shana%20pro.JPG" alt="Shana Gates, REALTOR&reg;" />
      <div class="overline">Ready to Buy or Sell?</div>
      <h3>Let's Talk Coachella Valley</h3>
      <p>Shana Gates knows this market inside and out. Whether you're buying your dream desert home or ready to sell, she's here to guide you every step of the way.</p>
      <a href="mailto:shana@craftbauer.com" class="cta-btn">Contact Shana &rarr;</a>
    </div>
  </article>

  <!-- YLOPO listings — only shown when the post is tagged to a specific CV city -->
  <section id="cityListingsSection" class="listings-section" style="display:none;">
    <div class="listings-inner">
      <div class="listings-eyebrow">Browse the Market</div>
      <h2 class="listings-heading" id="listingsHeading">Homes for Sale</h2>
      <p class="listings-sub" id="listingsSub">Active listings in this community</p>
      <div id="ylopoWidget"></div>
      <div><a class="listings-view-all" id="listingsViewAll" href="#" target="_blank" rel="noopener">View All Listings &rarr;</a></div>
    </div>
  </section>

  <footer>
    <p>&copy; 2026 Shana Gates &middot; Craft &amp; Bauer | Real Broker &middot; Coachella Valley, CA</p>
    <p style="margin-top:8px;">All content for informational purposes. Not legal or financial advice. <a href="/blog/">&larr; Back to Blog</a></p>
  </footer>

  <script>
    const CATEGORY_COLORS = {
      'market-update': '#2563eb',
      'buying-tips': '#4CAF50',
      'selling-tips': '#0ea5e9',
      'community-spotlight': '#9C27B0',
      'investment': '#FF9800',
      'news': '#607D8B',
      'local-area': '#D97706',
      'market-insight': '#4338CA',
    }
    const CATEGORY_LABELS = {
      'market-update': 'Market Update',
      'buying-tips': 'Buying Tips',
      'selling-tips': 'Selling Tips',
      'community-spotlight': 'Community Spotlight',
      'investment': 'Investment',
      'news': 'News',
      'local-area': 'Local Area',
      'market-insight': 'Market Insight',
    }
    const CITY_META = {
      'palm-springs':       { name: 'Palm Springs',       page: '/palm-springs.html',       ylopoCity: 'Palm+Springs' },
      'palm-desert':        { name: 'Palm Desert',        page: '/palm-desert.html',        ylopoCity: 'Palm+Desert' },
      'rancho-mirage':      { name: 'Rancho Mirage',      page: '/rancho-mirage.html',      ylopoCity: 'Rancho+Mirage' },
      'indian-wells':       { name: 'Indian Wells',       page: '/indian-wells.html',       ylopoCity: 'Indian+Wells' },
      'la-quinta':          { name: 'La Quinta',          page: '/la-quinta.html',          ylopoCity: 'La+Quinta' },
      'indio':              { name: 'Indio',              page: '/indio.html',              ylopoCity: 'Indio' },
      'cathedral-city':     { name: 'Cathedral City',     page: '/cathedral-city.html',     ylopoCity: 'Cathedral+City' },
      'desert-hot-springs': { name: 'Desert Hot Springs', page: '/desert-hot-springs.html', ylopoCity: 'Desert+Hot+Springs' },
      'coachella':          { name: 'Coachella',          page: '/coachella.html',          ylopoCity: 'Coachella' },
    }

    // Open all external links in a new tab (entity links from Markdown, etc.)
    function openExternalLinksInNewTab(html) {
      return html.replace(/<a (href="https?:\/\/[^"]+")([^>]*)>/gi, function(m, href, rest) {
        if (rest.indexOf('target=') !== -1) return m
        return '<a ' + href + rest + ' target="_blank" rel="noopener noreferrer">'
      })
    }

    // Wrap equity / home-value phrases in a link to the seller equity page
    function addEquityLinks(html) {
      const SELLER_URL = 'https://search.searchcoachellavalleyhomes.com/seller'
      // Split on existing <a> tags so we never double-link
      const parts = html.split(/(<a\\b[^>]*>[\\s\\S]*?<\\/a>)/i)
      const pattern = /\\b(home equity|property equity|equity in (?:your|their|the) (?:home|property)|home value|property value|home valuation|property valuation|home appraisal|property appraisal|value of (?:your|their|the) (?:home|property)|(?:your|their|the) home(?:'s)? (?:value|worth|equity)|(?:your|their|the) property(?:'s)? (?:value|worth|equity)|what (?:your|the|their) home is worth|what(?:'s)? (?:your|the|their) (?:home|property) worth|(?:your|their|the) home(?:'s)? current (?:value|worth)|estimated (?:home|property) value|home(?:'s)? worth)\\b/gi
      return parts.map((part, i) => {
        if (i % 2 === 1) return part // already inside an anchor tag
        return part.replace(pattern, '<a href="' + SELLER_URL + '" target="_blank" rel="noopener" class="equity-link">$1</a>')
      }).join('')
    }

    function renderYlopoWidget(cityName) {
      const section = document.getElementById('cityListingsSection')
      if (!section || !cityName) return
      document.getElementById('listingsHeading').textContent = 'Homes for Sale in ' + cityName
      document.getElementById('listingsSub').textContent = 'Browse active listings in ' + cityName + ', CA'
      const cityEnc = encodeURIComponent(cityName).replace(/%20/g, '+')
      document.getElementById('listingsViewAll').href =
        'https://search.searchcoachellavalleyhomes.com/search?s[orderBy]=sourceCreationDate%2Cdesc&s[page]=1&s[locations][0][city]=' + cityEnc + '&s[locations][0][state]=CA'
      window.YLOPO_HOSTNAME = 'search.searchcoachellavalleyhomes.com'
      window.YLOPO_WIDGETS = { domain: 'search.searchcoachellavalleyhomes.com' }
      const dataSearch = JSON.stringify({ locations: [{ city: cityName, state: 'CA' }], propertyTypes: ['house', 'condo', 'townhouse'], limit: 12 })
      document.getElementById('ylopoWidget').innerHTML = '<div class="YLOPO_resultsWidget" data-search=\\'' + dataSearch.replace(/'/g, "\\\\'") + '\\'></div>'
      const s = document.createElement('script')
      s.src = 'https://search.searchcoachellavalleyhomes.com/build/js/widgets-1.0.0.js'
      document.body.appendChild(s)
      section.style.display = 'block'
    }

    function renderCVWidget() {
      const section = document.getElementById('cityListingsSection')
      if (!section) return
      document.getElementById('listingsHeading').textContent = 'Homes for Sale in the Coachella Valley'
      document.getElementById('listingsSub').textContent = 'Browse active listings across Palm Springs, Palm Desert, La Quinta & more'
      document.getElementById('listingsViewAll').href =
        'https://search.searchcoachellavalleyhomes.com/search?s[orderBy]=sourceCreationDate%2Cdesc&s[page]=1'
      window.YLOPO_HOSTNAME = 'search.searchcoachellavalleyhomes.com'
      window.YLOPO_WIDGETS = { domain: 'search.searchcoachellavalleyhomes.com' }
      const locations = [
        {city:'Palm Springs',state:'CA'},{city:'Palm Desert',state:'CA'},
        {city:'Rancho Mirage',state:'CA'},{city:'Indian Wells',state:'CA'},
        {city:'La Quinta',state:'CA'},{city:'Indio',state:'CA'},
        {city:'Cathedral City',state:'CA'},{city:'Desert Hot Springs',state:'CA'},
        {city:'Coachella',state:'CA'}
      ]
      const dataSearch = JSON.stringify({ locations, propertyTypes: ['house','condo','townhouse'], limit: 12 })
      document.getElementById('ylopoWidget').innerHTML = '<div class="YLOPO_resultsWidget" data-search=\\'' + dataSearch.replace(/'/g, "\\\\'") + '\\'></div>'
      const s = document.createElement('script')
      s.src = 'https://search.searchcoachellavalleyhomes.com/build/js/widgets-1.0.0.js'
      document.body.appendChild(s)
      section.style.display = 'block'
    }

    function renderCityLinkCard(citySlug) {
      const meta = CITY_META[citySlug]
      if (!meta) return
      const searchUrl = 'https://search.searchcoachellavalleyhomes.com/search?s[orderBy]=sourceCreationDate%2Cdesc&s[page]=1&s[locations][0][city]=' + meta.ylopoCity + '&s[locations][0][state]=CA'
      const el = document.getElementById('cityLinkCard')
      el.innerHTML = \`
        <div class="city-link-card">
          <div class="city-link-left">
            <div class="overline">Explore \${meta.name}</div>
            <h3>Homes for Sale in \${meta.name}</h3>
          </div>
          <div class="city-link-actions">
            <a href="\${meta.page}" class="city-link-btn">Community Guide &rarr;</a>
            <a href="\${searchUrl}" class="city-link-btn-outline" target="_blank" rel="noopener">Search Active Listings &rarr;</a>
          </div>
        </div>\`
      el.style.display = 'block'
    }

    async function loadPost() {
      // PAGE_SLUG is injected server-side
      const slug = window.PAGE_SLUG
      if (!slug) { window.location.href = '/blog/'; return }

      const res = await fetch('/api/blog/post?slug=' + encodeURIComponent(slug))
      if (res.status === 404) {
        document.getElementById('loadingState').innerHTML = '<div style="text-align:center;padding:80px 0;color:rgba(255,255,255,0.4)"><h2>Post not found</h2><p><a href="/blog/" style="color:#B8975A">&larr; Back to Blog</a></p></div>'
        return
      }
      if (!res.ok) throw new Error('Server error ' + res.status)
      const data = await res.json()
      const post = data.post

      document.title = post.title + ' — Shana Gates Blog'

      if (post.heroImageUrl) {
        const img = document.getElementById('heroImage')
        img.src = post.heroImageUrl
        img.alt = post.title
        img.style.display = 'block'
      }

      const color = CATEGORY_COLORS[post.category] || '#607D8B'
      const label = CATEGORY_LABELS[post.category] || post.category
      const date = new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      document.getElementById('postMeta').innerHTML =
        '<span class="category-badge" style="background:' + color + '22;color:' + color + ';">' + label + '</span>' +
        '<span class="post-date">' + date + '</span>'

      document.getElementById('postBody').innerHTML = openExternalLinksInNewTab(addEquityLinks(marked.parse(post.body || '')))

      if (post.city) {
        renderCityLinkCard(post.city)
        const cityMeta = CITY_META[post.city]
        if (cityMeta) renderYlopoWidget(cityMeta.name)
        else renderCVWidget()
      } else {
        renderCVWidget()
      }

      if (post.sourceUrl && post.sourceTitle) {
        const sc = document.getElementById('sourceCredit')
        sc.innerHTML = 'Source: <a href="' + post.sourceUrl + '" target="_blank" rel="noopener noreferrer">' + post.sourceTitle + '</a>'
        sc.style.display = 'block'
      }

      document.getElementById('loadingState').style.display = 'none'
      document.getElementById('postWrap').style.display = 'block'
    }

    loadPost().catch(() => {
      document.getElementById('loadingState').innerHTML = '<div style="text-align:center;padding:80px 0;color:rgba(255,255,255,0.4)"><p>Failed to load post. <a href="/blog/" style="color:#B8975A">&larr; Back to Blog</a></p></div>'
    })
  </script>

</body>
</html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
  res.status(200).send(html)
}
