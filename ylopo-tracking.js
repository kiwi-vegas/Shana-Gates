(function () {
  var YLOPO_DOMAIN = 'search.searchcoachellavalleyhomes.com'

  function getPageSlug() {
    var path = location.pathname.replace(/\/$/, '').split('/').pop() || 'home'
    return path.replace(/\.html$/, '')
  }

  function getWidgetSection(el) {
    var node = el
    while (node && node !== document.body) {
      if (node.id) return node.id
      if (node.classList && node.classList.contains('YLOPO_resultsWidget')) return 'results-widget'
      node = node.parentElement
    }
    return 'page'
  }

  function appendUTM(href) {
    try {
      var u = new URL(href)
      var slug = getPageSlug()
      u.searchParams.set('utm_source', 'website')
      u.searchParams.set('utm_medium', 'idx')
      u.searchParams.set('utm_campaign', slug)
      u.searchParams.set('utm_content', 'ylopo-widget')
      return u.toString()
    } catch (e) {
      return href
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target
    while (el && el.tagName !== 'A') el = el.parentElement
    if (!el || !el.href) return
    if (el.href.indexOf(YLOPO_DOMAIN) === -1) return

    var slug = getPageSlug()
    var section = getWidgetSection(e.target)

    if (window.gtag) {
      window.gtag('event', 'idx_property_click', {
        page_slug: slug,
        page_path: location.pathname,
        widget_section: section,
        destination_url: el.href,
        click_text: (el.textContent || '').trim().slice(0, 100)
      })
    }

    var newHref = appendUTM(el.href)
    if (newHref !== el.href) {
      e.preventDefault()
      window.open(newHref, el.target || '_self')
    }
  }, { capture: true })
})()
