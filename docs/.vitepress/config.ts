import { defineConfig } from 'vitepress'
import cliPkg from '../../packages/cli/package.json' with { type: 'json' }

export default defineConfig({
  title: 'tsops',
  description: 'Typed application delivery for TypeScript monorepos on Kubernetes',
  base: '/tsops/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/tsops/favicon.svg' }],
    ['link', { rel: 'apple-touch-icon', href: '/tsops/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#3178c6' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en' }],
    ['meta', { property: 'og:title', content: 'tsops | One typed application graph' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'From stable local URLs to selective pull-request previews and Kubernetes deploys.'
      }
    ],
    ['meta', { property: 'og:site_name', content: 'tsops' }],
    ['meta', { property: 'og:image', content: '/tsops/og-image.svg' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: '/tsops/og-image.svg' }]
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Comparison', link: '/guide/comparison' },
      { text: 'Examples', link: '/examples/' },
      { text: 'API', link: '/api/' },
      {
        text: `v${cliPkg.version}`,
        items: [
          { text: 'Changelog', link: 'https://github.com/Pom4H/tsops/blob/main/CHANGELOG.md' },
          { text: 'Roadmap', link: 'https://github.com/Pom4H/tsops/blob/main/ROADMAP.md' },
          { text: 'Contributing', link: 'https://github.com/Pom4H/tsops/blob/main/CONTRIBUTING.md' }
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is tsops?', link: '/guide/what-is-tsops' },
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Quick start', link: '/guide/quick-start' },
            { text: 'How it compares', link: '/guide/comparison' }
          ]
        },
        {
          text: 'Delivery workflow',
          items: [
            { text: 'Local development', link: '/guide/local-development' },
            { text: 'Preview environments', link: '/guide/preview-overlays' },
            { text: 'Context helpers', link: '/guide/context-helpers' },
            { text: 'Secrets and ConfigMaps', link: '/guide/secrets' }
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/examples/' },
            { text: 'Full-stack app', link: '/examples/fullstack' },
            { text: 'Monitoring', link: '/examples/monitoring' },
            { text: 'Monorepo', link: '/examples/monorepo' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API reference',
          items: [{ text: 'Overview', link: '/api/' }]
        }
      ]
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/Pom4H/tsops' }],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025-present tsops contributors'
    },

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/Pom4H/tsops/edit/main/docs/:path'
    }
  }
})
