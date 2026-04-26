# Memograph

Memograph is a local-first Vue knowledge graph for creating pages and connecting them with typed, weighted relations.

## Development

```bash
npm install
npm run dev
```

## Vercel deploy

This repo is a Vite app. Vercel can build it with `npm run build` and serve the generated `dist` directory.

## Data storage path

Current data is stored in `localStorage` through `src/services/graphRepository.js`. That file is the seam for the next step: replace the local repository with calls to Vercel API routes, then connect those routes to Memgraph so nodes and edges persist outside the browser.
