# tsops Documentation

This directory contains the VitePress documentation for tsops.

## Development

Start the dev server:

```bash
pnpm docs:dev
```

Open http://localhost:5173/tsops/

## Build

Build the documentation:

```bash
pnpm docs:build
```

Preview the built site:

```bash
pnpm docs:preview
```

## Structure

```
docs/
├── .vitepress/
│   ├── config.ts          # VitePress configuration
│   └── theme/
│       ├── index.ts       # Custom theme
│       └── custom.css     # Custom styles
├── guide/                 # User guide
├── examples/              # Examples
├── api/                   # API reference
├── public/                # Static assets
└── index.md               # Homepage
```

## Adding Pages

1. Create a new `.md` file in the appropriate directory
2. Add it to the sidebar in `.vitepress/config.ts`
3. Write content using Markdown and Vue components

## Deployment

Documentation is automatically deployed to GitHub Pages when changes are pushed to main branch.

See `.github/workflows/deploy-docs.yml` for details.

## Features

- ✅ Full-text search
- ✅ Dark mode
- ✅ Mobile responsive
- ✅ TypeScript syntax highlighting
- ✅ Custom styling
- ✅ Auto-deployment

## Links

- Live docs: https://yourusername.github.io/tsops/
- VitePress docs: https://vitepress.dev/

