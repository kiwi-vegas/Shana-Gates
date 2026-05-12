/**
 * lib/scoring.ts
 *
 * Deterministic scoring helpers for the idea engine.
 * The LLM scoring dimensions (localRelevance, formatFit, audienceValue, seoPotential)
 * are computed inside the Claude batch call in research.ts.
 * This module handles the deterministic dimensions and final assembly.
 *
 * Scoring dimensions (100 pts total):
 *   localRelevance    0–25  (LLM)
 *   timeliness        0–20  (deterministic — from publishedDate)
 *   formatFit         0–15  (LLM)
 *   audienceValue     0–15  (LLM)
 *   sourceCredibility 0–10  (deterministic — from domain)
 *   novelty           0–10  (deterministic — from covered topics)
 *   seoPotential      0–5   (LLM)
 */

import { sourceCredibilityScore, sourceBonus, isDisqualified } from './source-rules'
import type { IdeaScore, IdeaUrgency } from './types'

// ─── Timeliness ───────────────────────────────────────────────────────────────

export function computeTimeliness(publishedDate?: string): { score: number; urgency: IdeaUrgency } {
  if (!publishedDate) return { score: 8, urgency: 'evergreen' }

  const published = new Date(publishedDate)
  const now = new Date()
  const hoursDiff = (now.getTime() - published.getTime()) / (1000 * 60 * 60)

  if (hoursDiff < 6)   return { score: 20, urgency: 'breaking' }
  if (hoursDiff < 24)  return { score: 18, urgency: 'breaking' }
  if (hoursDiff < 48)  return { score: 16, urgency: 'timely' }
  if (hoursDiff < 72)  return { score: 14, urgency: 'timely' }
  if (hoursDiff < 168) return { score: 11, urgency: 'timely' }   // within 1 week
  if (hoursDiff < 336) return { score: 8,  urgency: 'evergreen' } // within 2 weeks
  if (hoursDiff < 720) return { score: 5,  urgency: 'evergreen' } // within 1 month
  return { score: 2, urgency: 'evergreen' }
}

// ─── Source credibility ───────────────────────────────────────────────────────

export function computeSourceCredibility(domains: string[]): number {
  if (domains.length === 0) return 4
  const scores = domains.map((d) => sourceCredibilityScore(d))
  return Math.max(...scores)
}

export function shouldDisqualify(domains: string[]): boolean {
  if (domains.length === 0) return false
  return domains.every((d) => isDisqualified(d))
}

// ─── Novelty ─────────────────────────────────────────────────────────────────

export function computeNovelty(title: string, coveredTopics: Set<string>): number {
  if (coveredTopics.size === 0) return 10

  const words = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)

  let maxOverlap = 0
  for (const topic of coveredTopics) {
    const topicWords = topic.split(/[-\s]+/).filter((w) => w.length > 3)
    const overlap = words.filter((w) => topicWords.includes(w)).length
    const overlapRatio = overlap / Math.min(words.length, topicWords.length)
    if (overlapRatio > maxOverlap) maxOverlap = overlapRatio
  }

  if (maxOverlap > 0.7) return 1
  if (maxOverlap > 0.5) return 3
  if (maxOverlap > 0.3) return 6
  if (maxOverlap > 0.1) return 8
  return 10
}

// ─── End-of-month event boost ─────────────────────────────────────────────────
// Last week of each month, community posts get a boost so Coachella Valley
// events content surfaces above other categories in the idea queue.

export function computeEndOfMonthEventBoost(category: string, now: Date = new Date()): number {
  if (category !== 'community') return 0
  const day = now.getDate()
  if (day >= 25) return 15
  if (day >= 22) return 8
  return 0
}

// ─── Final assembly ───────────────────────────────────────────────────────────

export interface LLMDimensions {
  localRelevance: number   // 0–25
  formatFit: number        // 0–15
  audienceValue: number    // 0–15
  seoPotential: number     // 0–5
}

export function assembleScore(
  llm: LLMDimensions,
  timeliness: number,
  sourceCredibility: number,
  novelty: number,
  sourceDomains: string[],
  category?: string,
): IdeaScore {
  const bestBonus = sourceDomains.length > 0
    ? Math.max(...sourceDomains.map((d) => sourceBonus(d)))
    : 0

  const localRelevance   = Math.min(25, llm.localRelevance)
  const timelinessScore  = Math.min(20, timeliness)
  const formatFitScore   = Math.min(15, llm.formatFit + (bestBonus > 3 ? 1 : 0))
  const audienceScore    = Math.min(15, llm.audienceValue)
  const credScore        = Math.min(10, sourceCredibility)
  const noveltyScore     = Math.min(10, novelty)
  const seoScore         = Math.min(5,  llm.seoPotential)
  const eventBoost       = category ? computeEndOfMonthEventBoost(category) : 0

  const total = localRelevance + timelinessScore + formatFitScore + audienceScore + credScore + noveltyScore + seoScore + eventBoost

  return {
    total,
    localRelevance,
    timeliness:        timelinessScore,
    formatFit:         formatFitScore,
    audienceValue:     audienceScore,
    sourceCredibility: credScore,
    novelty:           noveltyScore,
    seoPotential:      seoScore,
  }
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

export const SCORE_THRESHOLD = 55
export const TOP_PICK_THRESHOLD = 75
export const BREAKING_ALERT_THRESHOLD = 85
