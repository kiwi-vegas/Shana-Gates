/**
 * lib/blog-redis.ts
 * Drop-in replacement for lib/blog-sanity.ts.
 * Stores blog posts and community overrides in Upstash Redis.
 * Stores uploaded images in Vercel Blob.
 */

import { put } from '@vercel/blob'
import { redis } from './blog-store'
import type { BlogPostOutput } from './writer'
import type { HeroImageResult } from './blog-images'

// ── Types ──────────────────────────────────────────────────────────────────

export interface BlogPostSummary {
  _id: string
  title: string
  slug: string
  publishedAt: string
  category: string
  excerpt: string
  heroImageUrl: string | null
  pipeline: string
  city?: string
}

export interface BlogPostFull extends BlogPostSummary {
  body: string
  sourceUrl?: string
  sourceTitle?: string
}

// ── Image upload via Vercel Blob ───────────────────────────────────────────

export async function uploadImageAsset(
  buffer: Buffer,
  filename: string,
  contentType = 'image/jpeg'
): Promise<string> {
  const { url } = await put(`blog-images/${filename}`, buffer, {
    access: 'public',
    contentType,
  })
  return url
}

// ── Blog post publish ──────────────────────────────────────────────────────

export async function publishBlogPost(
  post: BlogPostOutput,
  heroImage: HeroImageResult
): Promise<{ _id: string; slug: string }> {
  const _id = `${post.slug}-${Date.now()}`
  const publishedAt = new Date().toISOString()
  const heroImageUrl = heroImage.imageUrl ?? null

  const full: BlogPostFull = {
    _id,
    title: post.title,
    slug: post.slug,
    publishedAt,
    category: post.category,
    excerpt: post.excerpt,
    body: post.body,
    pipeline: post.pipeline,
    city: post.city,
    heroImageUrl,
    sourceUrl: post.sourceUrl || '',
    sourceTitle: post.sourceTitle || '',
  }

  // Store full post
  await redis.set(`blog_post:${post.slug}`, JSON.stringify(full))

  // Update index (summaries only, sorted desc by publishedAt)
  const summary: BlogPostSummary = {
    _id, title: full.title, slug: full.slug, publishedAt,
    category: full.category, excerpt: full.excerpt,
    heroImageUrl, pipeline: full.pipeline, city: full.city,
  }
  const raw = await redis.get<string>('blog_posts_index')
  const existing: BlogPostSummary[] = raw
    ? (typeof raw === 'string' ? JSON.parse(raw) : (raw as BlogPostSummary[]))
    : []
  const filtered = existing.filter((p) => p.slug !== post.slug)
  filtered.unshift(summary)
  filtered.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  await redis.set('blog_posts_index', JSON.stringify(filtered))

  return { _id, slug: post.slug }
}

// ── Blog post reads ────────────────────────────────────────────────────────

export async function getPublishedPosts(limit = 24): Promise<BlogPostSummary[]> {
  const raw = await redis.get<string>('blog_posts_index')
  if (!raw) return []
  const all: BlogPostSummary[] = typeof raw === 'string' ? JSON.parse(raw) : (raw as BlogPostSummary[])
  return all.slice(0, limit)
}

export async function getPostBySlug(slug: string): Promise<BlogPostFull | null> {
  const raw = await redis.get<string>(`blog_post:${slug}`)
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : (raw as BlogPostFull)
}

// ── Community page overrides ───────────────────────────────────────────────

export interface CommunityOverride {
  quickStats?: Array<{ key: string; value: string }>
  heroImage?: { asset: { url: string } } | null
  sectionImages?: Array<{ role: string; image: { asset: { url: string } } }>
  heroHeadline?: string
  heroSubheadline?: string
  overviewTitle?: string
  metaTitle?: string
  metaDescription?: string
}

export async function getCommunityOverride(slug: string): Promise<CommunityOverride | null> {
  const raw = await redis.get<string>(`community_override:${slug}`)
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : (raw as CommunityOverride)
}

export async function setCommunityOverride(slug: string, data: CommunityOverride): Promise<void> {
  await redis.set(`community_override:${slug}`, JSON.stringify(data))
}
