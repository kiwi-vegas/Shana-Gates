import { createClient } from '@sanity/client'

// Project ID and dataset are constants for this deployment — hardcoded to
// avoid issues if the SANITY_PROJECT_ID env var is set to an invalid value.
const PROJECT_ID = 'll3zy5cp'
const DATASET = 'production'

export const readClient = createClient({
  projectId: PROJECT_ID,
  dataset: DATASET,
  useCdn: true,
  apiVersion: '2024-01-01',
})

export const writeClient = createClient({
  projectId: PROJECT_ID,
  dataset: DATASET,
  useCdn: false,
  apiVersion: '2024-01-01',
  token: process.env.SANITY_WRITE_TOKEN,
})
