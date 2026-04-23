/**
 * api/blog/strategic.ts
 * Strategic evergreen blog post pipeline.
 * Adapts high-performing post patterns from comparable markets to the Coachella Valley.
 *
 * GET  ?action=topics  → return the 15 pre-loaded strategic topics
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

// ── 15 strategic topics adapted from proven high-performers ───────────────────
// Original patterns: "What does it cost", city comparisons, seller cost breakdowns,
// state-specific guides, and timing/market posts — all localized to Coachella Valley.

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

    // ── Publish with thumbnails ──────────────────────────────────────────────
    if (action === 'publish') {
      const { draftId, images } = req.body
      // images: { landscape?: string | null, square?: string | null, vertical?: string | null }
      if (!draftId) return res.status(400).json({ error: 'draftId required' })
      if (!images || (!images.landscape && !images.square && !images.vertical)) {
        return res.status(400).json({ error: 'At least one thumbnail image is required' })
      }

      const rawDraft = await redis.get<string>(`strategic_draft:${draftId}`)
      if (!rawDraft) return res.status(404).json({ error: 'Draft not found — it may have already been published' })
      const draft: StrategicDraft = typeof rawDraft === 'string' ? JSON.parse(rawDraft) : rawDraft

      try {
        // Upload each provided format to Vercel Blob
        const uploadedUrls: Record<string, string> = {}
        for (const [format, dataUrl] of Object.entries(images as Record<string, string | null>)) {
          if (!dataUrl) continue
          const base64 = dataUrl.split(',')[1]
          const buffer = Buffer.from(base64, 'base64')
          const isPng = dataUrl.startsWith('data:image/png')
          const ext = isPng ? 'png' : 'jpg'
          const { url } = await put(
            `blog-thumbnails/${draftId}-${format}.${ext}`,
            buffer,
            { access: 'public', contentType: isPng ? 'image/png' : 'image/jpeg' }
          )
          uploadedUrls[format] = url
        }

        // Blog hero = landscape first, then square, then vertical
        const heroImageUrl = uploadedUrls.landscape ?? uploadedUrls.square ?? uploadedUrls.vertical ?? null

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

        return res.status(200).json({ ok: true, slug: result.slug, uploadedUrls })
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
