/**
 * community-map.js — Shared 3D map initialization for all 9 CV community pages.
 * Reads window.CV_MAP_CONFIG set by each page's inline script.
 *
 * Features:
 *  - Mapbox Standard style with 'night' light preset (dark + lit 3D buildings)
 *  - 45–50° pitch for 3D building depth
 *  - City boundary polygon (bronze tint + outline)
 *  - I-10 and Hwy 111 highlighted as major valley corridors
 *  - Per-city POI markers with popup labels
 *  - Navigation control (tilt + zoom) on the interactive lifestyle map
 *  - Lazy-loads the lifestyle map via IntersectionObserver
 */
;(function () {
  'use strict'

  var cfg = window.CV_MAP_CONFIG
  if (!cfg) return

  var TOKEN = 'pk.eyJ1IjoidmVnYXMta2l3aSIsImEiOiJjbW8waXJoaWEwOHN2MnJxYTl2bWNlaGp0In0.C57V2IUuHiNKHn5LLlbXog'
  var BRONZE = '#B8975A'

  mapboxgl.accessToken = TOKEN

  // ── Major valley roads ───────────────────────────────────────────────────
  // I-10 (east–west freeway across the northern valley)
  var I10 = [
    [-116.784, 33.923], [-116.680, 33.913], [-116.590, 33.903],
    [-116.520, 33.892], [-116.457, 33.878], [-116.418, 33.869],
    [-116.380, 33.854], [-116.308, 33.820], [-116.240, 33.785],
    [-116.170, 33.755]
  ]

  // Highway 111 (commercial corridor through the urban core)
  var HWY111 = [
    [-116.550, 33.822], [-116.520, 33.812], [-116.468, 33.803],
    [-116.415, 33.742], [-116.385, 33.723], [-116.328, 33.716],
    [-116.301, 33.708], [-116.243, 33.720], [-116.175, 33.705]
  ]

  function addRoads (map) {
    // I-10 — blue highway tint with subtle glow
    map.addSource('cv-i10', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: I10 }, properties: {} }
    })
    map.addLayer({ id: 'cv-i10-glow', type: 'line', source: 'cv-i10',
      paint: { 'line-color': '#5ba4ff', 'line-width': 5, 'line-opacity': 0.25, 'line-blur': 4 }
    })
    map.addLayer({ id: 'cv-i10-line', type: 'line', source: 'cv-i10',
      paint: { 'line-color': '#7dbfff', 'line-width': 2, 'line-opacity': 0.75 }
    })

    // Hwy 111 — bronze tint matching site palette
    map.addSource('cv-hwy111', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: HWY111 }, properties: {} }
    })
    map.addLayer({ id: 'cv-hwy111-glow', type: 'line', source: 'cv-hwy111',
      paint: { 'line-color': BRONZE, 'line-width': 5, 'line-opacity': 0.20, 'line-blur': 4 }
    })
    map.addLayer({ id: 'cv-hwy111-line', type: 'line', source: 'cv-hwy111',
      paint: { 'line-color': BRONZE, 'line-width': 2, 'line-opacity': 0.60 }
    })
  }

  // ── City boundary ────────────────────────────────────────────────────────
  function addBoundary (map) {
    map.addSource('cv-boundary', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [cfg.boundary] },
        properties: {}
      }
    })
    map.addLayer({ id: 'cv-boundary-fill', type: 'fill', source: 'cv-boundary',
      paint: { 'fill-color': BRONZE, 'fill-opacity': 0.10 }
    })
    map.addLayer({ id: 'cv-boundary-line', type: 'line', source: 'cv-boundary',
      paint: { 'line-color': BRONZE, 'line-width': 2.5, 'line-opacity': 0.90 }
    })
  }

  // ── POI markers ──────────────────────────────────────────────────────────
  function addPOIs (map) {
    if (!cfg.pois || !cfg.pois.length) return
    cfg.pois.forEach(function (poi) {
      var el = document.createElement('div')
      el.className = 'cv-map-poi'
      el.setAttribute('title', poi.name)
      el.textContent = poi.icon || '◆'

      var popup = new mapboxgl.Popup({
        offset: 22,
        closeButton: false,
        maxWidth: '220px',
        className: 'cv-poi-popup'
      }).setHTML(
        '<div class="cv-poi-name">' + poi.name + '</div>' +
        (poi.desc ? '<div class="cv-poi-desc">' + poi.desc + '</div>' : '')
      )

      new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([poi.lng, poi.lat])
        .setPopup(popup)
        .addTo(map)
    })
  }

  // ── Corner label ─────────────────────────────────────────────────────────
  function addLabel (containerId) {
    var container = document.getElementById(containerId)
    if (!container) return
    var label = document.createElement('div')
    label.className = 'cv-map-label'
    label.innerHTML =
      '<span class="cv-map-label-city">' + cfg.city + '</span>' +
      '<span class="cv-map-label-sub">' + (cfg.subtitle || 'Coachella Valley, CA') + '</span>'
    container.appendChild(label)
  }

  // ── Map factory ──────────────────────────────────────────────────────────
  function makeMap (containerId, opts) {
    var map = new mapboxgl.Map({
      container: containerId,
      style: 'mapbox://styles/mapbox/standard',
      center: [cfg.lng, cfg.lat],
      zoom: opts.zoom || 12,
      pitch: opts.pitch !== undefined ? opts.pitch : 50,
      bearing: opts.bearing !== undefined ? opts.bearing : -15,
      interactive: opts.interactive !== false,
      attributionControl: false
    })

    map.on('load', function () {
      // Standard style night preset — dark buildings, lit windows
      try { map.setConfigProperty('basemap', 'lightPreset', 'night') } catch (e) {}

      addRoads(map)
      addBoundary(map)
      addPOIs(map)

      if (opts.showLabel) addLabel(containerId)
      if (opts.controls) {
        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right')
      }
    })

    return map
  }

  // ── Hero map (static, slightly tilted) ───────────────────────────────────
  makeMap('hero-map', {
    zoom: cfg.heroZoom || 12,
    pitch: 45,
    bearing: -10,
    interactive: false
  })

  // ── Lifestyle map (lazy, fully interactive) ───────────────────────────────
  var lifestyleInit = false
  var lifestyleEl = document.getElementById('lifestyle-map')
  if (lifestyleEl) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && !lifestyleInit) {
        lifestyleInit = true
        makeMap('lifestyle-map', {
          zoom: cfg.lifestyleZoom || 11.5,
          pitch: 52,
          bearing: -17,
          interactive: true,
          showLabel: true,
          controls: true
        })
      }
    }, { threshold: 0.1 }).observe(lifestyleEl)
  }

  // ── Scroll reveal (unchanged from original) ───────────────────────────────
  document.querySelectorAll('.reveal').forEach(function (el) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) e.target.classList.add('visible')
      })
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }).observe(el)
  })
})()
