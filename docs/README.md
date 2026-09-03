# tsops documentation

The public documentation is built with VitePress from this directory and published at:

https://pom4h.github.io/tsops/

## Local development

From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm docs:dev
```

Open the URL printed by VitePress. The configured base path is `/tsops/`.

## Validate the site

```bash
pnpm docs:build
pnpm docs:preview
```

The build must succeed without `ignoreDeadLinks`. Broken internal links are repository failures, not warnings to suppress.

## Structure

```text
docs/
├── .vitepress/        site configuration and theme
├── guide/             product concepts and workflows
├── examples/          documentation for source examples
├── api/               public API overview
├── public/            static assets
└── index.md           homepage
```

## Editing rules

1. Update the closest existing page before creating another overlapping guide.
2. Link to a maintained file under `examples/` instead of copying a large configuration.
3. Use the current Node.js requirement and public CLI flags.
4. Add every new page to `.vitepress/config.ts` when it belongs in navigation.
5. Run `pnpm docs:build` before opening a pull request.

GitHub Pages deployment is defined in `.github/workflows/deploy-docs.yml`.
