/**
 * lib/source-rules.ts
 *
 * Classifies article sources by domain into credibility tiers.
 * Used by the idea scoring engine to assign sourceCredibility (0–10)
 * and to hard-disqualify low-trust sources before they reach the review queue.
 */

export type SourceType =
  | 'local-news'          // Desert Sun, KESQ, CBS Local, NBC Palm Springs, etc.
  | 'local-government'    // palm-springs.org, palmdesert.gov, laquintaca.gov, etc.
  | 'state-government'    // ca.gov, dre.ca.gov, hcd.ca.gov, etc.
  | 'federal-government'  // fema.gov, hud.gov, census.gov, etc.
  | 'national-outlet'     // wsj.com, bloomberg.com, nytimes.com, etc.
  | 'market-data'         // altosresearch.com, redfin.com, zillow.com, nar.realtor, etc.
  | 'real-estate-assoc'   // car.org, desertareaarealtors.com, etc.
  | 'generic-re-site'     // inman.com, realtor.com, houselogic.com
  | 'agent-blog'          // Individual agent or team blog
  | 'content-farm'        // Sites producing bulk low-quality RE content
  | 'unknown'

// ─── Trusted local news ───────────────────────────────────────────────────────

const LOCAL_NEWS_DOMAINS = new Set([
  'desertsun.com',
  'kesq.com',
  'kpsp.com',
  'nbcpalmsprings.com',
  'kmir.com',
  'abc7.com',
  'latimes.com',
  'cbslocal.com',
  'cbsnews.com',
  'ktla.com',
  'knbc.com',
  'patch.com',            // local Patch editions for CV cities
  'cv-magazine.com',      // Coachella Valley Magazine
  'thedailycritica.com',
])

// ─── Local government ─────────────────────────────────────────────────────────

const LOCAL_GOV_DOMAINS = new Set([
  'palm-springs.org',
  'palmdesert.gov',
  'ci.laquinta.ca.us',
  'laquintaca.gov',
  'indian-wells.org',
  'ranchomirageca.gov',
  'cityofindio.org',
  'cathedralcity.gov',
  'cityofdeserthotsprings.com',
  'coachella.org',
  'countyofriverside.us',
  'rivcas.org',           // Riverside County Assessor
])

// ─── State government ─────────────────────────────────────────────────────────

const STATE_GOV_DOMAINS = new Set([
  'ca.gov',
  'gov.ca.gov',
  'dre.ca.gov',           // CA Dept of Real Estate
  'hcd.ca.gov',           // Housing & Community Development
  'boe.ca.gov',           // Board of Equalization (property tax)
  'ftb.ca.gov',           // Franchise Tax Board
  'oag.ca.gov',           // CA Attorney General
  'treasurer.ca.gov',
  'dir.ca.gov',
  'housing.ca.gov',
  'floodsmart.gov',
])

// ─── Federal government ───────────────────────────────────────────────────────

const FEDERAL_GOV_DOMAINS = new Set([
  'fema.gov',
  'hud.gov',
  'va.gov',
  'census.gov',
  'irs.gov',
  'freddiemac.com',
  'fanniemae.com',
  'cfpb.gov',
  'federalreserve.gov',
  'bls.gov',
  'commerce.gov',
])

// ─── Trusted national outlets ─────────────────────────────────────────────────

const NATIONAL_OUTLET_DOMAINS = new Set([
  'wsj.com',
  'bloomberg.com',
  'reuters.com',
  'apnews.com',
  'nytimes.com',
  'washingtonpost.com',
  'cnbc.com',
  'marketwatch.com',
  'fortune.com',
  'businessinsider.com',
  'theatlantic.com',
  'axios.com',
  'npr.org',
  'pbs.org',
  'politico.com',
  'usatoday.com',
])

// ─── Market data / real estate data providers ─────────────────────────────────

const MARKET_DATA_DOMAINS = new Set([
  'altosresearch.com',
  'redfin.com',
  'zillow.com',
  'trulia.com',
  'corelogic.com',
  'attomdata.com',
  'blackknightinc.com',
  'mba.org',             // Mortgage Bankers Association
  'nar.realtor',
  'housingwire.com',
  'firstam.com',
  'rismedia.com',
  'car.org',             // California Association of Realtors
])

// ─── Real estate associations ─────────────────────────────────────────────────

const REALTORS_ASSOC_DOMAINS = new Set([
  'car.org',
  'desertareaarealtors.com',
  'nar.realtor',
  'realtor.org',
  'crmls.org',           // California Regional MLS
])

// ─── Generic real estate sites (low value, not disqualified) ─────────────────

const GENERIC_RE_DOMAINS = new Set([
  'realtor.com',
  'homes.com',
  'houselogic.com',
  'inman.com',
  'rismedia.com',
  'propertywire.com',
  'realestaterama.com',
])

// ─── Hard-disqualified: content farms + agent blogs ───────────────────────────

const DISQUALIFIED_DOMAINS = new Set([
  'realtytimes.com',
  'realtytoday.com',
  'agentadvice.com',
  'theclose.com',
  'keepingcurrentmatters.com',
  'placester.com',
  'curaytor.com',
  'homesnap.com',
  'buffiniandcompany.com',
  'tomferry.com',
  'outboundengine.com',
  'wikihow.com',
  'ehow.com',
  'hunker.com',
])

// ─── Agent blog patterns (never self-cite) ───────────────────────────────────

const AGENT_BLOG_PATTERNS = [
  /shanasells/i,
  /shanagates/i,
  /craftbauer/i,
]

// ─── Public API ───────────────────────────────────────────────────────────────

export function classifySource(domain: string): SourceType {
  const d = domain.toLowerCase().replace(/^www\./, '')

  if (LOCAL_NEWS_DOMAINS.has(d)) return 'local-news'
  if (LOCAL_GOV_DOMAINS.has(d)) return 'local-government'
  if (STATE_GOV_DOMAINS.has(d) || d.endsWith('.ca.gov')) return 'state-government'
  if (FEDERAL_GOV_DOMAINS.has(d) || d.endsWith('.gov')) return 'federal-government'
  if (NATIONAL_OUTLET_DOMAINS.has(d)) return 'national-outlet'
  if (MARKET_DATA_DOMAINS.has(d)) return 'market-data'
  if (REALTORS_ASSOC_DOMAINS.has(d)) return 'real-estate-assoc'
  if (GENERIC_RE_DOMAINS.has(d)) return 'generic-re-site'
  if (DISQUALIFIED_DOMAINS.has(d)) return 'content-farm'
  if (AGENT_BLOG_PATTERNS.some((p) => p.test(d))) return 'agent-blog'

  return 'unknown'
}

export function isDisqualified(domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, '')
  if (DISQUALIFIED_DOMAINS.has(d)) return true
  if (AGENT_BLOG_PATTERNS.some((p) => p.test(d))) return true
  return false
}

export function sourceCredibilityScore(domain: string): number {
  const type = classifySource(domain)
  switch (type) {
    case 'local-news':        return 9
    case 'local-government':  return 10
    case 'state-government':  return 10
    case 'federal-government':return 9
    case 'national-outlet':   return 7
    case 'market-data':       return 8
    case 'real-estate-assoc': return 7
    case 'generic-re-site':   return 4
    case 'agent-blog':        return 1
    case 'content-farm':      return 0
    case 'unknown':           return 4
  }
}

export function sourceTypeLabel(domain: string): string {
  const type = classifySource(domain)
  switch (type) {
    case 'local-news':        return 'Local News'
    case 'local-government':  return 'Local Government'
    case 'state-government':  return 'State Government'
    case 'federal-government':return 'Federal Government'
    case 'national-outlet':   return 'National Outlet'
    case 'market-data':       return 'Market Data'
    case 'real-estate-assoc': return 'RE Association'
    case 'generic-re-site':   return 'Real Estate Site'
    case 'agent-blog':        return 'Agent Blog'
    case 'content-farm':      return 'Low Quality'
    case 'unknown':           return 'Web'
  }
}

export function sourceBonus(domain: string): number {
  const type = classifySource(domain)
  switch (type) {
    case 'local-news':        return 5
    case 'local-government':  return 5
    case 'state-government':  return 5
    case 'federal-government':return 5
    case 'national-outlet':   return 3
    case 'market-data':       return 3
    case 'real-estate-assoc': return 2
    default:                  return 0
  }
}
