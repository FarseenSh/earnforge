// SPDX-License-Identifier: Apache-2.0
import { defineCollection } from 'astro:content'
import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'

// Astro 7 removed the implicit filesystem loader that collections used to get
// for free, so a collection declared without one resolves empty. That is not a
// build error — the site still builds, it just builds a single 404 page — so
// the loader has to be explicit for the docs to exist at all.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
}
