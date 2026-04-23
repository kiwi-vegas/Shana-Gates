/**
 * api/blog/strategic.ts
 * Strategic evergreen blog post pipeline.
 * Adapts high-performing post patterns from comparable markets to the Coachella Valley.
 *
 * GET  ?action=topics  → return the 35 pre-loaded strategic topics
 * GET  ?action=drafts  → return pending drafts from Redis
 * POST { action: 'draft', topicId }                      → Claude writes post, stores draft
 * POST { action: 'publish', draftId, imageDataUrl }      → upload thumbnail + publish to blog
 * POST { action: 'delete', draftId }                     → discard draft
 */

import { createHmac } from 'crypto'
import { put } from '@vercel/blob'
import { redis } from '../../lib/blog-store'
import { writeFromTopic } from '../../lib/writer'
import { publishBlogPost } from '../../lib/blog-redis'
import type { WeeklyTopic } from '../../lib/blog-store'

const COOKIE_NAME = 'sg_assistant_session'

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {}
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=')
      return [k.trim(), v.join('=')]
    })
  )
}

function verifyToken(token: string, secret: string): boolean {
  const lastDot = token.lastIndexOf('.')
  if (lastDot === -1) return false
  const payload = token.slice(0, lastDot)
  const sig = token.slice(lastDot + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  return sig === expected
}

// ── 35 strategic topics adapted from proven high-performers ───────────────────
// Original patterns: "What does it cost", city comparisons, seller cost breakdowns,
// home value estimates, STR guides, relocation, retirement, and market reports —
// all localized to the Coachella Valley.

const STRATEGIC_TOPICS: WeeklyTopic[] = [
  {
    id: 'st-01',
    title: 'What Does It Cost to Buy a Luxury Home in Palm Springs in 2026?',
    angle: 'Complete cost breakdown for buying a luxury home in Palm Springs: purchase price ranges by neighborhood (Old Las Palmas, Movie Colony, South End), closing costs (typically 2–5%), inspection fees, HOA dues in resort communities, property taxes at 1.1% base rate, and first-year ownership costs buyers rarely account for. Compare mid-century modern fixer vs turnkey updated homes.',
    category: 'buying-tips',
    researchContext: 'Palm Springs luxury real estate market 2026, California buyer closing costs breakdown, Palm Springs neighborhoods price per square foot',
    keywords: ['cost to buy Palm Springs home', 'Palm Springs luxury real estate costs', 'buyer closing costs California desert'],
  },
  {
    id: 'st-02',
    title: 'What Does It Cost to Sell a Home in the Coachella Valley in 2026?',
    angle: 'All-in seller cost breakdown for the Coachella Valley: agent commissions post-NAR settlement, pre-sale prep and staging costs for desert homes, escrow and title fees, transfer taxes, capital gains considerations for snowbirds and second-home owners, and a realistic net proceeds walkthrough.',
    category: 'selling-tips',
    researchContext: 'Seller costs California real estate 2026, Coachella Valley home selling expenses, NAR commission changes 2024',
    keywords: ['cost to sell Coachella Valley home', 'seller net proceeds California', 'real estate selling costs desert'],
  },
  {
    id: 'st-03',
    title: 'What Are the Closing Costs for Home Buyers in the Coachella Valley in 2026?',
    angle: 'Itemized breakdown of every closing cost a buyer pays in the Coachella Valley: loan origination, title insurance, escrow fees, property tax proration, homeowners insurance, HOA transfer fees, and Riverside County-specific charges. What to expect on the closing disclosure and how to negotiate credits.',
    category: 'buying-tips',
    researchContext: 'California buyer closing costs 2026, Riverside County recording fees, escrow fees desert real estate',
    keywords: ['buyer closing costs Coachella Valley', 'escrow fees California', 'title insurance Palm Springs'],
  },
  {
    id: 'st-04',
    title: 'What Are the Closing Costs for Home Sellers in California in 2026?',
    angle: 'California seller closing costs line by line: agent commissions under the new NAR rules, Riverside County transfer tax, natural hazard disclosure fees, HOA payoff and transfer fees, escrow and title split, and city-specific requirements in Palm Springs vs Palm Desert vs La Quinta.',
    category: 'selling-tips',
    researchContext: 'California seller closing costs 2026, Riverside County transfer tax rate, city transfer tax Palm Springs',
    keywords: ['seller closing costs California', 'California transfer tax real estate', 'Palm Springs seller fees'],
  },
  {
    id: 'st-05',
    title: 'What Do Sellers Pay in California Real Estate Commissions in 2026?',
    angle: 'How commissions changed after the NAR settlement: what California sellers now negotiate, what buyer\'s agent compensation looks like today, how it plays out in a luxury desert transaction, and why the right agent still more than earns their fee in a market this specific.',
    category: 'selling-tips',
    researchContext: 'NAR commission settlement California impact 2026, buyer agent compensation changes, real estate commission negotiation',
    keywords: ['real estate commissions California 2026', 'NAR settlement seller impact', 'buyer agent fees Coachella Valley'],
  },
  {
    id: 'st-06',
    title: 'How Do Seller Concessions Work in California Real Estate in 2026?',
    angle: 'What seller concessions are, when buyers ask for them in the Coachella Valley, how much is typical (1–3% of purchase price), how they affect your net proceeds vs. a simple price reduction, and when a confident seller should push back — especially during peak winter snowbird season.',
    category: 'selling-tips',
    researchContext: 'Seller concessions California real estate 2026, Coachella Valley buyer negotiation tactics',
    keywords: ['seller concessions California', 'closing cost credits Coachella Valley', 'real estate negotiation desert'],
  },
  {
    id: 'st-07',
    title: 'Palm Springs vs Palm Desert: Which Real Estate Market Wins in 2026?',
    angle: 'Side-by-side comparison: median price points, property types and architectural styles, short-term rental regulations (Palm Springs allows STR with permit; Palm Desert is more restricted), Airbnb investment potential, lifestyle differences, and which city makes more sense for primary residence vs. vacation home vs. investment property.',
    category: 'community-spotlight',
    researchContext: 'Palm Springs vs Palm Desert real estate comparison 2026, STR regulations Palm Springs Palm Desert, median home prices comparison',
    keywords: ['Palm Springs vs Palm Desert real estate', 'which desert city to buy', 'STR permit comparison desert'],
  },
  {
    id: 'st-08',
    title: 'La Quinta vs Indian Wells: Which Desert Luxury Market Wins in 2026?',
    angle: 'Detailed comparison of La Quinta and Indian Wells: price per sq ft, HOA fee ranges, golf community culture (PGA West vs Indian Wells CC), second-home vs primary-residence buyer ratios, rental demand differences, and what each city\'s future looks like with planned development and infrastructure projects.',
    category: 'community-spotlight',
    researchContext: 'La Quinta vs Indian Wells real estate 2026, PGA West homes market, Indian Wells luxury market comparison',
    keywords: ['La Quinta vs Indian Wells', 'desert luxury real estate comparison', 'PGA West real estate investment'],
  },
  {
    id: 'st-09',
    title: 'What Does It Cost to Relocate to the Coachella Valley in 2026?',
    angle: 'Full relocation cost guide for the most common feeder markets (LA, Bay Area, Seattle, Chicago): moving costs, first-year housing cost comparison, Prop 19 property tax transfer savings for California homeowners 55+, income tax implications for out-of-state buyers, and the costs first-timers consistently underestimate.',
    category: 'buying-tips',
    researchContext: 'Relocating to Palm Springs Coachella Valley 2026, California Prop 19 tax transfer, cost of living comparison desert',
    keywords: ['relocating to Coachella Valley', 'cost of living Palm Springs vs LA', 'Prop 19 base year transfer'],
  },
  {
    id: 'st-10',
    title: 'What Does It Cost to Buy a Home in Palm Desert in 2026?',
    angle: 'Realistic price guide for Palm Desert in 2026: what $400K, $650K, $900K, and $1.5M+ each actually get you by neighborhood, how prices have shifted over 3 years, which areas have appreciated most, and what the condo-vs-single-family trade-off looks like in today\'s market.',
    category: 'buying-tips',
    researchContext: 'Palm Desert home prices 2026, real estate market update by neighborhood, Palm Desert condo vs house comparison',
    keywords: ['Palm Desert home prices 2026', 'buying in Palm Desert budget', 'Palm Desert real estate market'],
  },
  {
    id: 'st-11',
    title: 'What Do California Home Sellers Need to Know About Appraisals in 2026?',
    angle: 'How the appraisal process works in California, what commonly triggers a low appraisal in the desert market (seasonal comp issues, solar system valuation, pool adjustments), how sellers can challenge a low appraisal, and what your options are when the appraisal comes in under the agreed-upon contract price.',
    category: 'selling-tips',
    researchContext: 'California home appraisal process 2026, low appraisal seller options, desert real estate appraisal challenges',
    keywords: ['home appraisal California sellers', 'low appraisal options seller', 'desert home valuation solar pool'],
  },
  {
    id: 'st-12',
    title: 'Is 2026 a Good Time to Buy in the Coachella Valley?',
    angle: 'Honest market analysis of whether 2026 is the right time to buy: current inventory levels across all 9 cities, price trend direction, where interest rates are headed, the snowbird seasonal effect on buyer competition, and which buyer profiles benefit most from acting now vs. waiting for a shift that may not come.',
    category: 'market-insight',
    researchContext: 'Coachella Valley real estate market conditions 2026, buyer demand desert housing, interest rate forecast 2026',
    keywords: ['best time to buy Coachella Valley', 'is 2026 a good time to buy Palm Springs', 'desert real estate market outlook'],
  },
  {
    id: 'st-13',
    title: 'What Permits Do You Need to Build a Pool in Palm Springs in 2026?',
    angle: 'Step-by-step guide to pool permits in Palm Springs and across the valley: city building permits, HOA approval process, setback and barrier requirements, typical timeline (6–12 weeks), average permit cost, and what buyers should know when purchasing a home with an unpermitted or undocumented pool.',
    category: 'local-area',
    researchContext: 'Palm Springs pool permit requirements 2026, Riverside County pool regulations, pool construction approval desert',
    keywords: ['pool permit Palm Springs', 'building permit pool California desert', 'unpermitted pool home purchase'],
  },
  {
    id: 'st-14',
    title: 'Coachella Valley HOA Fees: What Every Desert Buyer Must Know in 2026',
    angle: 'How HOA fees vary dramatically across the valley — from $150/month in standard neighborhoods to $1,500+/month in private golf clubs — what\'s included, how to vet an HOA\'s financial reserves and litigation history, how fees affect mortgage qualification, and red flags to look for in the HOA documents.',
    category: 'buying-tips',
    researchContext: 'HOA fees Coachella Valley 2026, desert golf community HOA comparison, California HOA reserve study requirements',
    keywords: ['HOA fees Coachella Valley', 'Palm Springs HOA costs', 'golf community HOA fees desert'],
  },
  {
    id: 'st-15',
    title: 'What Flood Zone Is My Coachella Valley Property In? (2026 Guide)',
    angle: 'How to look up your FEMA flood zone designation in the desert (many valley properties sit in Zone AE or X), what it means for mandatory flood insurance and mortgage requirements, how recent FEMA remapping has changed risk designations, and what the long-term Salton Sea situation means for properties near the eastern valley.',
    category: 'buying-tips',
    researchContext: 'Coachella Valley FEMA flood zones 2026, desert flood risk California, Salton Sea flooding risk real estate',
    keywords: ['flood zone Coachella Valley', 'FEMA flood map Palm Springs', 'desert flood insurance requirement'],
  },
  {
    id: 'st-16',
    title: 'What Is My Palm Springs Home Worth in 2026?',
    angle: 'How Palm Springs home values are determined in 2026: price per square foot by neighborhood (Old Las Palmas, Movie Colony, Deepwell Estates, Sunmor, South Palm Springs), how mid-century modern architecture commands a premium, the impact of recent comparable sales, and what sellers consistently over- or under-estimate about their home\'s current value.',
    category: 'selling-tips',
    researchContext: 'Palm Springs home values 2026, home valuation Palm Springs neighborhoods, mid-century modern home appraisal premium',
    keywords: ['Palm Springs home value 2026', 'what is my Palm Springs home worth', 'Palm Springs real estate market value'],
  },
  {
    id: 'st-17',
    title: 'What Is My Palm Desert Home Worth in 2026?',
    angle: 'How Palm Desert home values stack up in 2026: price benchmarks by neighborhood (South Palm Desert, Bighorn, The Reserve, Sun City), condo vs. single-family value dynamics, how proximity to El Paseo and Country Club Drive affects pricing, and what drives the gap between list price and actual sale price in today\'s market.',
    category: 'selling-tips',
    researchContext: 'Palm Desert home values 2026, Palm Desert neighborhood price comparison, Palm Desert real estate market 2026',
    keywords: ['Palm Desert home value 2026', 'what is my Palm Desert home worth', 'Palm Desert real estate pricing'],
  },
  {
    id: 'st-18',
    title: 'What Is My La Quinta Home Worth in 2026?',
    angle: 'La Quinta home value drivers in 2026: how PGA West and other private golf club memberships affect resale value, price per sq ft in gated vs. non-gated communities, the vacation rental premium on homes near SilverRock and Old Town, and how the Old Town renaissance is lifting values in adjacent neighborhoods.',
    category: 'selling-tips',
    researchContext: 'La Quinta home values 2026, PGA West home prices, La Quinta golf community real estate market',
    keywords: ['La Quinta home value 2026', 'what is my La Quinta home worth', 'PGA West home values'],
  },
  {
    id: 'st-19',
    title: 'What Is My Rancho Mirage Home Worth in 2026?',
    angle: 'Rancho Mirage home values in 2026: how the city\'s reputation as the "Beverly Hills of the Desert" sustains premium pricing, gated community price tiers (Mission Hills, Tamarisk CC, The Springs), how proximity to Eisenhower Health affects demand, and what sellers need to know about the pool of cash buyers in this specific market.',
    category: 'selling-tips',
    researchContext: 'Rancho Mirage home values 2026, Rancho Mirage luxury real estate market, gated community prices Rancho Mirage',
    keywords: ['Rancho Mirage home value 2026', 'what is my Rancho Mirage home worth', 'Rancho Mirage luxury market'],
  },
  {
    id: 'st-20',
    title: 'What Is My Indian Wells Home Worth in 2026?',
    angle: 'Indian Wells home values in 2026: why Indian Wells has the highest median price in the valley, how the Indian Wells Tennis Garden and BNP Paribas Open affect short-term demand and home values, what the ultra-low population density (under 5,000 residents) means for inventory and seller leverage, and realistic price per sq ft by community tier.',
    category: 'selling-tips',
    researchContext: 'Indian Wells home values 2026, Indian Wells luxury real estate, Indian Wells CC home prices',
    keywords: ['Indian Wells home value 2026', 'what is my Indian Wells home worth', 'Indian Wells real estate market'],
  },
  {
    id: 'st-21',
    title: 'Short-Term Rental Rules in Every Coachella Valley City: 2026 Guide',
    angle: 'City-by-city STR regulation breakdown for 2026: Palm Springs (permit required, noise ordinance, Good Neighbor policy), Palm Desert (recent restrictions), La Quinta (permit + HOA layer), Rancho Mirage (STR banned in most zones), Indian Wells (extremely restrictive), Cathedral City, Indio, and Coachella. What investors must check before buying, and which cities still make sense for the strategy.',
    category: 'investment',
    researchContext: 'Coachella Valley short-term rental regulations 2026, Palm Springs Airbnb permit requirements, desert STR rules by city',
    keywords: ['short-term rental rules Coachella Valley', 'Palm Springs Airbnb regulations 2026', 'STR permit desert cities'],
  },
  {
    id: 'st-22',
    title: 'Moving to the Coachella Valley from LA, OC, or San Diego: The Complete 2026 Guide',
    angle: 'Everything Southern California transplants need to know about moving to the desert: how property values compare to coastal cities dollar-for-dollar, what daily life actually looks like (summers, infrastructure, healthcare, dining), the Prop 19 base-year transfer opportunity for 55+ sellers, which cities suit which lifestyles, and the most common surprises for first-time desert residents.',
    category: 'local-area',
    researchContext: 'Moving to Coachella Valley from Los Angeles 2026, SoCal to desert relocation guide, Palm Springs vs LA cost comparison',
    keywords: ['moving to Coachella Valley from LA', 'relocating desert from Southern California', 'Palm Springs relocation guide 2026'],
  },
  {
    id: 'st-23',
    title: 'The Best Golf Communities in the Coachella Valley: Ranked for 2026',
    angle: 'Ranking the Coachella Valley\'s top golf communities for buyers in 2026: PGA West (La Quinta), Bighorn Golf Club (Palm Desert), The Reserve (Indian Wells), Mission Hills CC (Rancho Mirage), Tamarisk CC, Bermuda Dunes, and more. Compare initiation fees, HOA costs, home price ranges, course quality, and the full lifestyle each community delivers.',
    category: 'community-spotlight',
    researchContext: 'Best golf communities Coachella Valley 2026, PGA West real estate vs Bighorn, desert golf club home values',
    keywords: ['best golf communities Coachella Valley', 'PGA West homes for sale 2026', 'desert golf club real estate'],
  },
  {
    id: 'st-24',
    title: 'Land Lease vs. Fee Simple: What Every Desert Buyer Must Know in 2026',
    angle: 'The land lease situation unique to the Coachella Valley: how tribal land leases work (mostly in Palm Springs), how lease expiration dates affect home values and financing options, what happens when a lease approaches renewal, why some lenders won\'t finance land-lease homes, and how to evaluate whether a land-lease property at a discount is actually a good deal.',
    category: 'buying-tips',
    researchContext: 'Land lease homes Palm Springs 2026, tribal land lease California real estate, fee simple vs land lease desert',
    keywords: ['land lease homes Palm Springs', 'tribal land lease real estate', 'fee simple vs leasehold California desert'],
  },
  {
    id: 'st-25',
    title: 'Retiring in the Coachella Valley: Everything You Need to Know in 2026',
    angle: 'The complete retirement relocation guide for the desert: healthcare access (Eisenhower, Desert Regional, Kaiser), active adult communities (Sun City Palm Desert, Four Seasons Indio), retirement income tax advantages in California, cost of living vs. common retirement markets in Arizona and Florida, and which cities offer the best quality of life for different retirement lifestyles.',
    category: 'local-area',
    researchContext: 'Retiring in Coachella Valley 2026, Palm Springs retirement communities, Sun City Palm Desert active adult real estate',
    keywords: ['retiring in Palm Springs 2026', 'Coachella Valley retirement communities', 'best desert cities to retire California'],
  },
  {
    id: 'st-26',
    title: "Snowbird's Guide to Buying a Second Home in Palm Springs in 2026",
    angle: 'What snowbirds from cold-weather states and Canada need to know before buying in Palm Springs: seasonal occupancy considerations, vacation rental income during months away, property management costs, tax implications for out-of-state and Canadian buyers, how to choose between furnished turn-key vs. blank slate, and what to expect from the buying process as a non-resident.',
    category: 'buying-tips',
    researchContext: 'Snowbird second home Palm Springs 2026, Canadian buyers Palm Springs real estate, vacation home rental income desert',
    keywords: ['snowbird home Palm Springs 2026', 'buying second home Coachella Valley', 'winter home Palm Springs guide'],
  },
  {
    id: 'st-27',
    title: 'Living in Rancho Mirage: The Complete 2026 Guide',
    angle: 'An insider\'s guide to life in Rancho Mirage: what it\'s actually like to live here year-round vs. part-time, the city\'s amenities and services (Rancho Mirage Public Library, Agua Caliente Casino, Eisenhower nearby), price of entry for different lifestyles, the gated community culture, and why Rancho Mirage attracts a different buyer than Palm Springs or La Quinta.',
    category: 'community-spotlight',
    researchContext: 'Living in Rancho Mirage 2026, Rancho Mirage community guide, Rancho Mirage real estate lifestyle',
    keywords: ['living in Rancho Mirage', 'Rancho Mirage community guide 2026', 'Rancho Mirage real estate lifestyle'],
  },
  {
    id: 'st-28',
    title: 'How Much Can You Earn from a Short-Term Rental in Palm Springs in 2026?',
    angle: 'Real income projections for Palm Springs STR investors in 2026: average nightly rates by property size and neighborhood, occupancy rates by season (peak Jan–Apr vs. slow July–Aug), platform fee structures (Airbnb vs. VRBO), property management costs (15–25%), permit and TOT tax obligations, and realistic net yield after all expenses vs. long-term rental alternatives.',
    category: 'investment',
    researchContext: 'Palm Springs Airbnb income 2026, short-term rental revenue Palm Springs, STR yield vs long-term rental desert',
    keywords: ['Palm Springs Airbnb income 2026', 'STR investment returns desert', 'vacation rental income Palm Springs'],
  },
  {
    id: 'st-29',
    title: 'Capital Gains Tax When Selling Your Coachella Valley Home in 2026',
    angle: 'How capital gains tax affects Coachella Valley sellers in 2026: the primary residence exclusion ($250K/$500K), how it applies to snowbirds and second-home owners who split time, depreciation recapture for former rentals, California\'s additional capital gains tax on top of federal, and strategies sellers can use to minimize the tax hit legally (1031 exchange, installment sale, timing).',
    category: 'selling-tips',
    researchContext: 'Capital gains tax real estate California 2026, primary residence exclusion rules, 1031 exchange desert investment property',
    keywords: ['capital gains tax selling home California 2026', 'primary residence exclusion Palm Springs', '1031 exchange Coachella Valley'],
  },
  {
    id: 'st-30',
    title: 'Coachella Valley Home Price Trends: 2026 Annual Report',
    angle: 'A data-driven look at where Coachella Valley prices have gone over the past 3 years and where they\'re headed: median price by city, days on market trends, list-to-sale price ratios, which cities are outperforming and underperforming, how the market compares to coastal California, and what macro factors (interest rates, LA migration, remote work) are shaping 2026 demand.',
    category: 'market-insight',
    researchContext: 'Coachella Valley real estate market report 2026, desert home price trends, Riverside County housing market data',
    keywords: ['Coachella Valley home prices 2026', 'desert real estate market report', 'Palm Springs housing market trends'],
  },
  {
    id: 'st-31',
    title: "Is the Coachella Valley a Buyer's or Seller's Market in 2026?",
    angle: "A clear-eyed answer with supporting data: current months of supply across all 9 cities, how the balance has shifted since 2022, which price tiers are most competitive right now, what buyers and sellers should each expect in negotiations, and how seasonal patterns (snowbird influx vs. summer slowdown) flip the market dynamic within a single calendar year.",
    category: 'market-insight',
    researchContext: "Coachella Valley buyer's vs seller's market 2026, desert housing inventory levels, Palm Springs real estate competition 2026",
    keywords: ["buyer's market Coachella Valley 2026", 'desert real estate market conditions', 'housing inventory Palm Springs 2026'],
  },
  {
    id: 'st-32',
    title: 'Step-by-Step Guide to Buying a Home in the Coachella Valley in 2026',
    angle: "The complete buying roadmap for the desert market: pre-approval and lender selection, working with a local vs. out-of-area agent, how to search the valley's multiple micro-markets efficiently, making competitive offers (especially in winter season), what to inspect in a desert home (HVAC, flat roofs, pool equipment, pest), and what escrow and closing look like in California.",
    category: 'buying-tips',
    researchContext: 'Buying a home Coachella Valley step by step 2026, home buying process California desert, first-time buyer Palm Springs guide',
    keywords: ['how to buy a home Coachella Valley 2026', 'home buying process Palm Springs', 'first-time buyer desert guide'],
  },
  {
    id: 'st-33',
    title: 'What Home Improvements Add the Most Value Before Selling in the Desert in 2026?',
    angle: 'Desert-specific ROI breakdown for pre-sale improvements: pool condition and resurfacing (huge in this market), HVAC system age and efficiency, roof condition (flat roofs are buyer anxiety), fresh neutral paint, kitchen updates that move the needle vs. over-improvements, landscaping in extreme heat, and curb appeal strategies that work in a desert aesthetic.',
    category: 'selling-tips',
    researchContext: 'Home improvements ROI desert real estate 2026, pre-sale renovations Palm Springs, what adds value to Coachella Valley home',
    keywords: ['home improvements before selling desert 2026', 'pre-sale renovations Palm Springs', 'ROI home upgrades Coachella Valley'],
  },
  {
    id: 'st-34',
    title: 'Cost of Living in Palm Desert vs. Los Angeles: A Real 2026 Comparison',
    angle: 'A direct cost-of-living comparison showing exactly how far your dollar stretches: housing (median rent and purchase price), groceries, utilities (summer power bills in the desert are real), healthcare, dining, entertainment, and transportation. Why the numbers alone don\'t tell the whole story, and what LA residents gain and give up when they make the move.',
    category: 'local-area',
    researchContext: 'Cost of living Palm Desert vs Los Angeles 2026, desert vs coastal California living costs, Palm Desert lifestyle comparison',
    keywords: ['cost of living Palm Desert vs LA', 'moving from Los Angeles to desert 2026', 'Palm Desert vs Los Angeles comparison'],
  },
  {
    id: 'st-35',
    title: 'Best Cities in the Coachella Valley for Airbnb and VRBO in 2026',
    angle: 'Which desert cities actually make sense for short-term rental investment in 2026 — and which ones to avoid. Ranked by STR permissiveness, average daily rate, occupancy data, price of entry, and net yield. Palm Springs leads but is increasingly regulated; Indio and Cathedral City offer opportunity; Rancho Mirage is nearly off the table. What to look for in a high-performing STR property in this market.',
    category: 'investment',
    researchContext: 'Best cities Coachella Valley Airbnb investment 2026, STR market comparison desert, Indio Cathedral City short-term rental opportunity',
    keywords: ['best city Coachella Valley Airbnb 2026', 'STR investment desert cities ranked', 'short-term rental market Coachella Valley'],
  },
]

// ── Draft types ────────────────────────────────────────────────────────────────

interface StrategicDraft {
  id: string
  topicId: string
  title: string
  slug: string
  category: string
  excerpt: string
  body: string
  city?: string
  createdAt: string
}

type DraftSummary = Omit<StrategicDraft, 'body'>

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return res.status(500).json({ error: 'Not configured' })

  const cookies = parseCookies(req.headers.cookie)
  const token = cookies[COOKIE_NAME]
  if (!token || !verifyToken(token, secret)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const action = req.query?.action

    if (action === 'topics') {
      const raw = await redis.get<string>('strategic_drafts_index')
      const drafts: DraftSummary[] = raw
        ? (typeof raw === 'string' ? JSON.parse(raw) : raw)
        : []
      const draftedTopicIds = new Set(drafts.map((d) => d.topicId))
      return res.status(200).json({
        topics: STRATEGIC_TOPICS,
        draftedTopicIds: [...draftedTopicIds],
      })
    }

    if (action === 'drafts') {
      const raw = await redis.get<string>('strategic_drafts_index')
      const drafts: DraftSummary[] = raw
        ? (typeof raw === 'string' ? JSON.parse(raw) : raw)
        : []
      return res.status(200).json({ drafts })
    }

    return res.status(400).json({ error: 'Unknown action' })
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { action } = req.body ?? {}

    // ── Generate draft ───────────────────────────────────────────────────────
    if (action === 'draft') {
      const { topicId } = req.body
      const topic = STRATEGIC_TOPICS.find((t) => t.id === topicId)
      if (!topic) return res.status(404).json({ error: 'Topic not found' })

      try {
        const post = await writeFromTopic(topic)
        const draft: StrategicDraft = {
          id: `sd-${Date.now()}`,
          topicId: topic.id,
          title: post.title,
          slug: post.slug,
          category: post.category,
          excerpt: post.excerpt,
          body: post.body,
          city: post.city,
          createdAt: new Date().toISOString(),
        }

        await redis.set(`strategic_draft:${draft.id}`, JSON.stringify(draft))

        const rawIndex = await redis.get<string>('strategic_drafts_index')
        const index: DraftSummary[] = rawIndex
          ? (typeof rawIndex === 'string' ? JSON.parse(rawIndex) : rawIndex)
          : []
        const { body: _body, ...summary } = draft
        index.unshift(summary)
        await redis.set('strategic_drafts_index', JSON.stringify(index))

        return res.status(200).json({ ok: true, draft: summary })
      } catch (err: any) {
        console.error('[strategic] draft error:', err)
        return res.status(500).json({ error: err.message })
      }
    }

    // ── Upload a single thumbnail to Blob ────────────────────────────────────
    // Called once per bucket immediately when the user drops/selects a file.
    // Keeps individual requests small — no multi-image body size issues.
    if (action === 'upload-image') {
      const { draftId, format, imageDataUrl } = req.body
      if (!draftId || !format || !imageDataUrl) {
        return res.status(400).json({ error: 'draftId, format, and imageDataUrl required' })
      }
      if (!['landscape', 'square', 'vertical'].includes(format)) {
        return res.status(400).json({ error: 'format must be landscape, square, or vertical' })
      }
      try {
        const base64 = imageDataUrl.split(',')[1]
        const buffer = Buffer.from(base64, 'base64')
        const isPng = imageDataUrl.startsWith('data:image/png')
        const ext = isPng ? 'png' : 'jpg'
        const { url } = await put(
          `blog-thumbnails/${draftId}-${format}.${ext}`,
          buffer,
          { access: 'public', contentType: isPng ? 'image/png' : 'image/jpeg' }
        )
        return res.status(200).json({ ok: true, url, format })
      } catch (err: any) {
        console.error('[strategic] upload-image error:', err)
        return res.status(500).json({ error: err.message })
      }
    }

    // ── Publish — receives pre-uploaded Blob URLs, not raw image data ─────────
    if (action === 'publish') {
      const { draftId, imageUrls } = req.body
      // imageUrls: { landscape?: string, square?: string, vertical?: string }
      if (!draftId) return res.status(400).json({ error: 'draftId required' })
      if (!imageUrls || (!imageUrls.landscape && !imageUrls.square && !imageUrls.vertical)) {
        return res.status(400).json({ error: 'At least one thumbnail URL is required' })
      }

      const rawDraft = await redis.get<string>(`strategic_draft:${draftId}`)
      if (!rawDraft) return res.status(404).json({ error: 'Draft not found — it may have already been published' })
      const draft: StrategicDraft = typeof rawDraft === 'string' ? JSON.parse(rawDraft) : rawDraft

      try {
        // Blog hero = landscape (4:5) first, fall back to square, then vertical
        const heroImageUrl = imageUrls.landscape ?? imageUrls.square ?? imageUrls.vertical ?? null

        const result = await publishBlogPost(
          {
            title: draft.title,
            slug: draft.slug,
            excerpt: draft.excerpt,
            body: draft.body,
            category: draft.category,
            sourceUrl: '',
            sourceTitle: '',
            pipeline: 'weekly',
            city: draft.city,
          },
          { imageUrl: heroImageUrl }
        )

        const rawIndex = await redis.get<string>('strategic_drafts_index')
        const index: DraftSummary[] = rawIndex
          ? (typeof rawIndex === 'string' ? JSON.parse(rawIndex) : rawIndex)
          : []
        await redis.set('strategic_drafts_index', JSON.stringify(index.filter((d) => d.id !== draftId)))
        await redis.del(`strategic_draft:${draftId}`)

        return res.status(200).json({ ok: true, slug: result.slug })
      } catch (err: any) {
        console.error('[strategic] publish error:', err)
        return res.status(500).json({ error: err.message })
      }
    }

    // ── Delete draft ─────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { draftId } = req.body
      if (!draftId) return res.status(400).json({ error: 'draftId required' })

      const rawIndex = await redis.get<string>('strategic_drafts_index')
      const index: DraftSummary[] = rawIndex
        ? (typeof rawIndex === 'string' ? JSON.parse(rawIndex) : rawIndex)
        : []
      await redis.set('strategic_drafts_index', JSON.stringify(index.filter((d) => d.id !== draftId)))
      await redis.del(`strategic_draft:${draftId}`)

      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Unknown action' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
