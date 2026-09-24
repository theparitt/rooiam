# Rooiam documentation site

This Vite/React application renders the repository's public `docs/**/*.md` files. Edit those Markdown sources to update public documentation. Private maintainer notes are kept outside the public repository.

```bash
cd rooiam-docs
npm install
npm run dev
npm run build
npm run check:docs
```

Development and preview use port `5175`. The build runs TypeScript checks and writes `dist/`. Host the output with SPA fallback routing so direct document URLs work.

Set `VITE_BOOK_URL` to the deployed book origin before building; otherwise the book link defaults to `http://localhost:5176`.

`src/docs.ts` constructs routes, ordering, and source-relative Markdown links. Number prefixes are omitted in routes. The main docs index is `/docs-index`; the getting-started index is `/`. Keep route slugs unique and check that linked Markdown files are included in the public catalog.

The book is a separate application under `rooiam-book`, with chapter sources and navigation of its own.

## Cloudflare deployment

Run `npm run deploy` from this directory after authenticating Wrangler. It builds and publishes the current checkout to the `rooiam-docs` Cloudflare Pages project on production branch `main` (https://docs.rooiam.com).
The deploy script also runs the documentation checks and sets `VITE_BOOK_URL=https://book.rooiam.com` for the production build.
