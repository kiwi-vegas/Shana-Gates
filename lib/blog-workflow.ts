/**
 * lib/blog-workflow.ts
 * VA queue workflow helpers: social caption generation and state transitions.
 * Adapted from the VA Queue & Publish Pipeline pattern.
 */

import Anthropic from '@anthropic-ai/sdk'

// ── Social caption generation ──────────────────────────────────────────────

export async function generateSocialCaption(post: {
  title: string
  excerpt: string
  category: string
  slug: string
}): Promise<string> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Write a 2-3 sentence Facebook post caption for a real estate blog article.

Agent: Shana Gates, REALTOR® at Craft & Bauer | Real Broker — Coachella Valley, CA real estate expert.

Tone: Conversational, warm, knowledgeable. First person ("I" / "we"). Feels like advice from a trusted neighbor who knows the Palm Springs and Coachella Valley market inside out — not a pitch. End with a natural, low-pressure call to action to read the article.

No hashtags. Minimal emojis (one max, only if it feels natural).

Article:
Title: ${post.title}
Category: ${post.category}
Excerpt: ${post.excerpt ?? ''}

Return ONLY the caption text, nothing else.`,
        },
      ],
    })

    const text =
      response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    return text || `New post: ${post.title}. Read the full story on the blog.`
  } catch {
    return `New post: ${post.title}. Read the full breakdown on the blog.`
  }
}
