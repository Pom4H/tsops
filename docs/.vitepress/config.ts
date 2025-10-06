import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "tsops",
  description: "TypeScript-first toolkit for Kubernetes deployments",
  base: '/tsops/',
  ignoreDeadLinks: true,
  
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/tsops/favicon.svg' }],
    ['link', { rel: 'apple-touch-icon', href: '/tsops/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#3178c6' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en' }],
    ['meta', { property: 'og:title', content: 'tsops | TypeScript-first Kubernetes toolkit' }],
    ['meta', { property: 'og:description', content: 'Deploy to Kubernetes with confidence using type-safe TypeScript configuration' }],
    ['meta', { property: 'og:site_name', content: 'tsops' }],
    ['meta', { property: 'og:image', content: '/tsops/og-image.svg' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: '/tsops/og-image.svg' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Examples', link: '/examples/' },
      { text: 'API', link: '/api/' },
      { 
        text: 'v1.1.0', 
        items: [
          { text: 'Changelog', link: 'https://github.com/Pom4H/tsops/blob/main/CHANGELOG.md' },
          { text: 'Contributing', link: '/guide/contributing' }
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is tsops?', link: '/guide/what-is-tsops' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Quick Start', link: '/guide/quick-start' },
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Context Helpers', link: '/guide/context-helpers' },
            { text: 'Secrets & ConfigMaps', link: '/guide/secrets' },
            { text: 'Networking', link: '/guide/networking' },
            { text: 'Building Images', link: '/guide/building' },
          ]
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Secret Validation', link: '/guide/secret-validation' },
            { text: 'Multi-Environment', link: '/guide/multi-environment' },
            { text: 'Monorepo Setup', link: '/guide/monorepo' },
            { text: 'CI/CD Integration', link: '/guide/cicd' },
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/examples/' },
            { text: 'Simple App', link: '/examples/simple-app' },
            { text: 'Full-Stack App', link: '/examples/fullstack' },
            { text: 'Microservices', link: '/examples/microservices' },
            { text: 'With Secrets', link: '/examples/with-secrets' },
          ]
        }
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'defineConfig', link: '/api/define-config' },
            { text: 'Context Helpers', link: '/api/context-helpers' },
            { text: 'CLI Commands', link: '/api/cli' },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Pom4H/tsops' }
    ],

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

