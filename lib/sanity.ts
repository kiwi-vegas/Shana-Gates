/**
 * lib/sanity.ts
 * Sanity client setup + community page read/write functions.
 * Community page overrides (stats, images, headlines) are stored as
 * communityPage documents in Sanity. The blog workflow stays in Redis.
 *
 * Env vars required in Vercel:
 *   SANITY_PROJECT_ID  — ll3zy5cp
 *   SANITY_DATASET     — production
 *   SANITY_WRITE_TOKEN — Editor-role token from sanity.io/manage
 */

import { createClient } from '@sanity/client'
import type { BlogPostDraft } from './types'

const PROJECT_ID = process.env.SANITY_PROJECT_ID ?? 'll3zy5cp'
const DATASET    = process.env.SANITY_DATASET    ?? 'production'
const API_VER    = '2024-01-01'

// Public CDN — fast reads, no auth, used by /api/community
export const readClient = createClient({
  projectId: PROJECT_ID,
  dataset:   DATASET,
  apiVersion: API_VER,
  useCdn:    true,
})

// Authenticated write client — used by AI Content Assistant
export const writeClient = createClient({
  projectId: PROJECT_ID,
  dataset:   DATASET,
  apiVersion: API_VER,
  useCdn:    false,
  token:     process.env.SANITY_WRITE_TOKEN,
})

// ── Types ──────────────────────────────────────────────────────────────────

export interface CommunityOverride {
  quickStats?:      Array<{ key: string; value: string }>
  heroImage?:       { asset: { url: string } } | null
  sectionImages?:   Array<{ role: string; image: { asset: { url: string } } }>
  heroHeadline?:    string
  heroSubheadline?: string
  overviewTitle?:   string
  metaTitle?:       string
  metaDescription?: string
}

// ── Read ───────────────────────────────────────────────────────────────────

export async function getCommunityOverride(slug: string): Promise<CommunityOverride | null> {
  const doc = await readClient.fetch<CommunityOverride | null>(
    `*[_type == "communityPage" && slug == $slug][0]{
      quickStats[]{ key, value },
      heroImage,
      sectionImages[]{ role, image },
      heroHeadline,
      heroSubheadline,
      overviewTitle,
      metaTitle,
      metaDescription
    }`,
    { slug }
  )
  return doc ?? null
}

// ── Write ──────────────────────────────────────────────────────────────────
// The caller always passes the fully-merged object (existing + new values),
// so createOrReplace is correct — no fields are silently lost.

export async function setCommunityOverride(slug: string, data: CommunityOverride): Promise<void> {
  const doc: Record<string, unknown> = {
    _type: 'communityPage',
    _id:   `communityPage-${slug}`,
    slug,
  }

  // Sanity arrays require a unique _key on each item
  if (data.quickStats !== undefined) {
    doc.quickStats = data.quickStats.map((s, i) => ({
      _key:  `qs-${i}-${s.key.toLowerCase().replace(/\s+/g, '-')}`,
      key:   s.key,
      value: s.value,
    }))
  }
  if (data.heroImage !== undefined) {
    doc.heroImage = data.heroImage
  }
  if (data.sectionImages !== undefined) {
    doc.sectionImages = data.sectionImages.map((s, i) => ({
      _key:  `si-${i}-${s.role}`,
      role:  s.role,
      image: s.image,
    }))
  }
  if (data.heroHeadline    !== undefined) doc.heroHeadline    = data.heroHeadline
  if (data.heroSubheadline !== undefined) doc.heroSubheadline = data.heroSubheadline
  if (data.overviewTitle   !== undefined) doc.overviewTitle   = data.overviewTitle
  if (data.metaTitle       !== undefined) doc.metaTitle       = data.metaTitle
  if (data.metaDescription !== undefined) doc.metaDescription = data.metaDescription

  await writeClient.createOrReplace(doc as any)
}

// ── Blog post CRUD ─────────────────────────────────────────────────────────

export async function publishBlogPost(draft: BlogPostDraft): Promise<string> {
  // Ensure slug is unique
  const existing = await readClient.fetch<string | null>(
    `*[_type == "blogPost" && slug.current == $slug][0]._id`,
    { slug: draft.slug }
  )
  const finalSlug = existing ? `${draft.slug}-${Date.now()}` : draft.slug

  const result = await writeClient.create({
    _type: 'blogPost',
    title: draft.title,
    slug: { _type: 'slug', current: finalSlug },
    publishedAt: new Date().toISOString(),
    category: draft.category,
    excerpt: draft.excerpt,
    body: draft.body,
    metaTitle: draft.metaTitle,
    metaDescription: draft.metaDescription,
    authorName: 'Shana Gates',
    aiGenerated: true,
    workflowStatus: 'published',
  })

  return result._id
}

export async function getBlogPost(slug: string): Promise<BlogPostDraft | null> {
  return readClient.fetch<BlogPostDraft | null>(
    `*[_type == "blogPost" && slug.current == $slug][0]{
      title, "slug": slug.current, excerpt, category,
      metaTitle, metaDescription, body, sourceUrl, sourceTitle
    }`,
    { slug }
  )
}
