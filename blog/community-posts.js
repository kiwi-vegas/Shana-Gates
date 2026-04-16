/**
 * community-posts.js
 * Included on all 9 Coachella Valley community pages.
 * Queries Sanity for blog posts tagged with this city and injects
 * a "From the Blog" section before #community-cta.
 */
;(function () {
  const CITY_NAMES = {
    'palm-springs': 'Palm Springs',
    'palm-desert': 'Palm Desert',
    'rancho-mirage': 'Rancho Mirage',
    'indian-wells': 'Indian Wells',
    'la-quinta': 'La Quinta',
    'indio': 'Indio',
    'cathedral-city': 'Cathedral City',
    'desert-hot-springs': 'Desert Hot Springs',
    'coachella': 'Coachella',
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

  // Detect city slug from the page URL (e.g. /palm-springs.html → 'palm-springs')
  var path = window.location.pathname.replace(/^\//, '').replace(/\.html$/, '')
  var cityName = CITY_NAMES[path]
  if (!cityName) return

  var PROJECT = 'll3zy5cp'
  var DATASET = 'production'
  var query = '*[_type == "blogPost" && city == "' + path + '"] | order(publishedAt desc) [0...3] { title, "slug": slug.current, publishedAt, excerpt, category }'
  var url = 'https://' + PROJECT + '.apicdn.sanity.io/v2024-01-01/data/query/' + DATASET + '?query=' + encodeURIComponent(query)

  fetch(url)
    .then(function (r) { return r.json() })
    .then(function (data) {
      var posts = data.result
      if (!posts || !posts.length) return

      var cardsHtml = posts.map(function (post) {
        var date = new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        var cat = post.category || 'news'
        var color = CATEGORY_COLORS[cat] || '#607D8B'
        var label = CATEGORY_LABELS[cat] || cat
        var excerpt = post.excerpt ? post.excerpt.slice(0, 140) + (post.excerpt.length > 140 ? '…' : '') : ''
        return '<a href="/blog/post.html?slug=' + encodeURIComponent(post.slug) + '" class="cbp-card">' +
          '<span class="cbp-badge" style="background:' + color + '22;color:' + color + ';">' + label + '</span>' +
          '<h3 class="cbp-title">' + post.title + '</h3>' +
          (excerpt ? '<p class="cbp-excerpt">' + excerpt + '</p>' : '') +
          '<span class="cbp-date">' + date + '</span>' +
          '</a>'
      }).join('')

      var section = document.createElement('section')
      section.id = 'community-blog-posts'
      section.innerHTML =
        '<div class="cbp-inner">' +
          '<p class="cbp-eyebrow">' + cityName + ' Real Estate Insights</p>' +
          '<h2 class="cbp-heading">From the Blog</h2>' +
          '<div class="cbp-grid">' + cardsHtml + '</div>' +
          '<a href="/blog/" class="cbp-all-link">View All Blog Posts →</a>' +
        '</div>'

      var cta = document.getElementById('community-cta')
      if (cta && cta.parentNode) cta.parentNode.insertBefore(section, cta)
    })
    .catch(function () {}) // Fail silently — section simply doesn't appear
})()
