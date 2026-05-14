/**
 * Caption builders for each social platform — Coachella Valley market, Shana Gates branding.
 */

import Anthropic from '@anthropic-ai/sdk'

export const SITE_URL = 'https://shanasells.com'

// ─── Per-platform hashtag maps ────────────────────────────────────────────────

const TIKTOK_BASE_HASHTAGS = [
  '#CoachellaValley', '#PalmSprings', '#PalmDesert', '#RanchoMirage', '#LaQuinta',
  '#IndianWells', '#realestate', '#realtor', '#ShanaGates', '#CraftAndBauer',
]

const TIKTOK_CATEGORY_HASHTAGS: Record<string, string[]> = {
  'market-update':    ['#realestatemarket', '#housingmarket', '#marketupdate', '#homeprices'],
  'investor-tips':    ['#realestateinvesting', '#investmentproperty', '#rentalincome', '#CVinvestor'],
  'seller-tips':      ['#homeseller', '#sellingyourhome', '#listingagent', '#homesellingtips'],
  'community':        ['#gatedcommunity', '#desertliving', '#CoachellaValleylife', '#luxuryliving'],
  'trending-topics':  ['#realestatenews', '#housingmarket', '#mortgagerates', '#desertrealestate'],
}

const LINKEDIN_CATEGORY_HASHTAGS: Record<string, string[]> = {
  'market-update':    ['#HousingMarket', '#RealEstateMarket', '#MarketUpdate'],
  'investor-tips':    ['#RealEstateInvesting', '#InvestmentProperty', '#DesertInvestment'],
  'seller-tips':      ['#HomeSelling', '#ListingAgent', '#HomeValue'],
  'community':        ['#DesertLiving', '#CoachellaValleyRealEstate', '#LuxuryRealEstate'],
  'trending-topics':  ['#HousingNews', '#MortgageRates', '#RealEstateNews'],
}

const X_CATEGORY_HASHTAGS: Record<string, string> = {
  'market-update':    '#realestate #housingmarket',
  'investor-tips':    '#realestate #investing',
  'seller-tips':      '#homeseller #realestate',
  'community':        '#CoachellaValley #desertliving',
  'trending-topics':  '#realestate #housingmarket',
}

const INSTAGRAM_CATEGORY_HASHTAGS: Record<string, string> = {
  'market-update':    '#CoachellaValley #RealEstate #CoachellaValleyRealEstate #PalmSprings #RealEstateMarket',
  'investor-tips':    '#RealEstateInvesting #CoachellaValley #InvestmentProperty #DesertLiving',
  'seller-tips':      '#HomeSelling #CoachellaValley #RealEstate #SellingYourHome #PalmDesert',
  'community':        '#CoachellaValley #GatedCommunity #DesertLiving #LuxuryRealEstate #PalmSprings',
  'trending-topics':  '#CoachellaValley #RealEstate #RealEstateNews #PalmDesert #PalmSprings',
}

// ─── Caption builders ─────────────────────────────────────────────────────────

export function buildTikTokCaption(copy: string, category: string | undefined, articleUrl: string): string {
  const categoryTags = TIKTOK_CATEGORY_HASHTAGS[category ?? ''] ?? []
  const allTags = [...TIKTOK_BASE_HASHTAGS, ...categoryTags]
  return `${copy}\n\n${articleUrl}\n\n${allTags.join(' ')}`
}

export function buildLinkedInCaption(copy: string, category: string | undefined, articleUrl: string): string {
  const categoryTags = LINKEDIN_CATEGORY_HASHTAGS[category ?? ''] ?? []
  const baseTags = ['#RealEstate', '#CoachellaValley', '#ShanaGates']
  return `${copy}\n\n${articleUrl}\n\n${[...baseTags, ...categoryTags].join(' ')}`
}

export function buildXCaption(copy: string, category: string | undefined, articleUrl: string): string {
  const tags = X_CATEGORY_HASHTAGS[category ?? ''] ?? '#realestate'
  const suffix = `\n\n${articleUrl} ${tags}`
  const maxCopy = 280 - suffix.length - 3
  const safeCopy = copy.length > maxCopy ? copy.slice(0, maxCopy) + '...' : copy
  return `${safeCopy}${suffix}`
}

export function buildThreadsCaption(copy: string, articleUrl: string): string {
  return `${copy}\n\n${articleUrl}`
}

export function buildInstagramCaption(copy: string, category: string | undefined, articleUrl: string): string {
  const tags = INSTAGRAM_CATEGORY_HASHTAGS[category ?? ''] ?? '#CoachellaValley #RealEstate #PalmSprings'
  return `${copy}\n\n${tags}\n\n${articleUrl}`
}

// ─── AI caption generation ────────────────────────────────────────────────────

export async function generatePlatformCaptions(post: {
  title: string
  excerpt?: string
  category?: string
}): Promise<{ facebook: string; youtube: string; linkedin: string; twitter: string; tiktok: string; threads: string; instagram: string }> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Write a short social media caption (2–3 sentences) for this Coachella Valley real estate blog post. Shana Gates, agent at Craft & Bauer | Real Broker. Warm, knowledgeable, not salesy.

Title: ${post.title}
Excerpt: ${post.excerpt ?? ''}
Category: ${post.category ?? 'general'}

Return JSON: { "facebook": "...", "youtube": "...", "linkedin": "...", "twitter": "...", "tiktok": "...", "threads": "...", "instagram": "..." }
Twitter/X must be under 200 characters. Return ONLY valid JSON.`,
    }],
  })

  const raw = (res.content[0] as { text: string }).text.trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  try {
    return JSON.parse(raw)
  } catch {
    const fallback = raw.match(/\{[\s\S]*\}/)
    if (fallback) return JSON.parse(fallback[0])
    const caption = `${post.title} — insights from the Coachella Valley real estate market.`
    return { facebook: caption, youtube: caption, linkedin: caption, twitter: post.title, tiktok: caption, threads: caption, instagram: caption }
  }
}
