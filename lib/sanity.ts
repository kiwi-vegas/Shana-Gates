import { createClient } from '@sanity/client'

const projectId = process.env.SANITY_PROJECT_ID ?? 'll3zy5cp'
const dataset = process.env.SANITY_DATASET ?? 'production'

export const readClient = createClient({
  projectId,
  dataset,
  useCdn: true,
  apiVersion: '2024-01-01',
})

export const writeClient = createClient({
  projectId,
  dataset,
  useCdn: false,
  apiVersion: '2024-01-01',
  token: process.env.SANITY_WRITE_TOKEN,
})
