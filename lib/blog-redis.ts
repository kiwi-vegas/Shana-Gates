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

export type BlogWorkflowStatus = 'media_pending' | 'media_ready' | 'published'

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
  workflowStatus?: BlogWorkflowStatus
  socialCopy?: string
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
    workflowStatus: 'media_pending', // hidden until reviewed + published via VA queue
  }

  // Store full post
  await redis.set(`blog_post:${post.slug}`, JSON.stringify(full))

  // Add to queue (not the public index — stays hidden until publishQueuedPost() is called)
  const summary: BlogPostSummary = {
    _id, title: full.title, slug: full.slug, publishedAt,
    category: full.category, excerpt: full.excerpt,
    heroImageUrl, pipeline: full.pipeline, city: full.city,
    workflowStatus: 'media_pending',
  }
  const qRaw = await redis.get<string>('blog_posts_queue')
  const queue: BlogPostSummary[] = qRaw
    ? (typeof qRaw === 'string' ? JSON.parse(qRaw) : (qRaw as BlogPostSummary[]))
    : []
  const qFiltered = queue.filter((p) => p.slug !== post.slug)
  qFiltered.unshift(summary)
  await redis.set('blog_posts_queue', JSON.stringify(qFiltered))

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

// ── VA Queue management ────────────────────────────────────────────────────

export async function getQueuedPosts(): Promise<BlogPostSummary[]> {
  const raw = await redis.get<string>('blog_posts_queue')
  if (!raw) return []
  return typeof raw === 'string' ? JSON.parse(raw) : (raw as BlogPostSummary[])
}

export async function markPostReady(
  slug: string,
  socialCopy: string,
  heroImageUrl?: string
): Promise<void> {
  const key = `blog_post:${slug}`
  const raw = await redis.get<string>(key)
  if (!raw) throw new Error(`Post not found: ${slug}`)
  const post: BlogPostFull = typeof raw === 'string' ? JSON.parse(raw) : raw
  post.workflowStatus = 'media_ready'
  post.socialCopy = socialCopy
  if (heroImageUrl !== undefined) post.heroImageUrl = heroImageUrl
  await redis.set(key, JSON.stringify(post))

  // Mirror status into queue summary
  const qRaw = await redis.get<string>('blog_posts_queue')
  const queue: BlogPostSummary[] = qRaw
    ? (typeof qRaw === 'string' ? JSON.parse(qRaw) : (qRaw as BlogPostSummary[]))
    : []
  const idx = queue.findIndex((p) => p.slug === slug)
  if (idx >= 0) {
    queue[idx].workflowStatus = 'media_ready'
    queue[idx].socialCopy = socialCopy
    if (heroImageUrl !== undefined) queue[idx].heroImageUrl = heroImageUrl
    await redis.set('blog_posts_queue', JSON.stringify(queue))
  }
}

export async function publishQueuedPost(slug: string): Promise<void> {
  const key = `blog_post:${slug}`
  const raw = await redis.get<string>(key)
  if (!raw) throw new Error(`Post not found: ${slug}`)
  const post: BlogPostFull = typeof raw === 'string' ? JSON.parse(raw) : raw
  post.workflowStatus = 'published'
  await redis.set(key, JSON.stringify(post))

  // Remove from queue
  const qRaw = await redis.get<string>('blog_posts_queue')
  const queue: BlogPostSummary[] = qRaw
    ? (typeof qRaw === 'string' ? JSON.parse(qRaw) : (qRaw as BlogPostSummary[]))
    : []
  const filteredQueue = queue.filter((p) => p.slug !== slug)
  await redis.set('blog_posts_queue', JSON.stringify(filteredQueue))

  // Add to public index, sorted desc by publishedAt
  const summary: BlogPostSummary = {
    _id: post._id, title: post.title, slug: post.slug, publishedAt: post.publishedAt,
    category: post.category, excerpt: post.excerpt, heroImageUrl: post.heroImageUrl,
    pipeline: post.pipeline, city: post.city, workflowStatus: 'published',
  }
  const iRaw = await redis.get<string>('blog_posts_index')
  const index: BlogPostSummary[] = iRaw
    ? (typeof iRaw === 'string' ? JSON.parse(iRaw) : (iRaw as BlogPostSummary[]))
    : []
  const filteredIndex = index.filter((p) => p.slug !== slug)
  filteredIndex.unshift(summary)
  filteredIndex.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  await redis.set('blog_posts_index', JSON.stringify(filteredIndex))
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
