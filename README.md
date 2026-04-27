# Memograph

Memograph is a Vue knowledge graph for creating pages and connecting them with typed, weighted relations.

## Development

```bash
npm install
npm run dev
```

The app persists graph data through Vercel API routes backed by Memgraph. For local API development, run Memgraph and use Vercel's dev server:

```bash
docker run -p 7687:7687 memgraph/memgraph
cp .env.example .env
npx vercel dev
```

## Vercel deploy

This repo is a Vite app. Vercel can build it with `npm run build` and serve the generated `dist` directory.

Configure these environment variables in the Vercel project:

- `MEMGRAPH_URI` - Memgraph Bolt URI, for example `bolt://localhost:7687`
- `MEMGRAPH_USER` - Memgraph username, if authentication is enabled
- `MEMGRAPH_PASSWORD` - Memgraph password, if authentication is enabled

For production setup details, hosting options, TLS notes, and a launch checklist, see [Memgraph + Vercel production deployment guide](docs/memgraph-vercel-production.md).

## Data storage path

Current data is loaded and saved through `src/services/graphRepository.js`, which calls `/api/graph/load` and `/api/graph/save`. The API routes store pages as `(:Page)` nodes and relationships as `[:RELATION]` edges in Memgraph.
