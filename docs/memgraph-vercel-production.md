# Memgraph + Vercel production deployment guide

Memograph's browser app is deployed on Vercel, but Memgraph itself cannot run inside Vercel. Vercel serverless functions are short-lived request handlers; they do not provide a persistent TCP service, disk volume, or long-running database process. Production therefore needs an external Memgraph endpoint that the Vercel API routes can reach over Bolt.

## Recommended architecture

```text
Browser
  │
  │ HTTPS
  ▼
Vercel static app + /api/graph/* functions
  │
  │ Bolt / Bolt+TLS
  ▼
Memgraph database
```

Use one Memgraph instance per environment:

- Production Vercel deployment → production Memgraph database.
- Preview deployments → separate preview/staging Memgraph database, or disable writes for previews.
- Local development → local Docker Memgraph.

## Option A: Managed Memgraph Cloud

This is the simplest production path if paying for a managed database is acceptable.

### 1. Create the database

1. Create a Memgraph Cloud account.
2. Create a new project or instance.
3. Choose a paid production tier for durable production data.
4. Copy the Bolt connection details:
   - Hostname
   - Port, commonly `7687`
   - Username
   - Password
   - Whether TLS is required

For TLS endpoints, the URI usually uses a secure Bolt scheme such as:

```bash
MEMGRAPH_URI=bolt+s://your-memgraph-host.example.com:7687
```

If the provider gives a plain Bolt endpoint for a trusted private network, use:

```bash
MEMGRAPH_URI=bolt://your-memgraph-host.example.com:7687
```

### 2. Configure Vercel environment variables

In the Vercel project dashboard:

1. Open **Settings → Environment Variables**.
2. Add these variables for **Production**:

   ```bash
   MEMGRAPH_URI=bolt+s://your-memgraph-host.example.com:7687
   MEMGRAPH_USER=your-production-user
   MEMGRAPH_PASSWORD=your-production-password
   ```

3. Add separate values for **Preview** only if preview deployments should use a staging Memgraph database.
4. Redeploy the Vercel project. Existing deployments do not automatically pick up changed environment variables.

### 3. Verify from Vercel

After redeploying, create or edit a page in the app and then call the load route:

```bash
curl https://YOUR_VERCEL_DOMAIN/api/graph/load
```

Expected response shape:

```json
{
  "nodes": [],
  "edges": []
}
```

If the API returns `500`, check Vercel Function logs first. The most common causes are:

- Missing or misspelled Vercel environment variables.
- Using `bolt://` when the provider requires `bolt+s://`.
- Memgraph instance paused, deleted, or not accepting remote Bolt connections.
- Incorrect username or password.

## Option B: Self-host Memgraph

Self-hosting avoids a managed database subscription, but it means operating a database yourself. Use this path only if you are comfortable managing uptime, upgrades, backups, TLS, credentials, and monitoring.

Good targets include a VPS or VM on providers such as AWS EC2, Google Compute Engine, Azure VM, DigitalOcean, Hetzner, or Fly.io Machines. Do not host this on Vercel.

### 1. Provision a server

Minimum production checklist:

1. Create a Linux VM.
2. Attach persistent disk storage.
3. Install Docker.
4. Open inbound TCP `7687` only to the networks that need it.
5. Create a DNS name such as `memgraph.example.com`.
6. Enable TLS for the Bolt endpoint before using it for production traffic.

Vercel's normal serverless egress IPs are not fixed on all plans. If you need strict IP allow-listing, use a Vercel plan/feature that provides stable egress or place Memgraph behind a private network, VPN, or proxy that Vercel can reach.

### 2. Run Memgraph with persistent storage

Example Docker Compose skeleton:

```yaml
services:
  memgraph:
    image: memgraph/memgraph:latest
    restart: unless-stopped
    ports:
      - "7687:7687"
    volumes:
      - memgraph-data:/var/lib/memgraph

volumes:
  memgraph-data:
```

Start it:

```bash
docker compose up -d
```

For production, extend this with Memgraph's current authentication, TLS, memory, snapshot, and durability settings from the official Memgraph operations documentation. Keep the final configuration under infrastructure-as-code or another controlled deployment process.

### 3. Secure the endpoint

Before connecting Vercel production traffic:

- Require authentication.
- Use TLS; prefer a CA-issued certificate and `bolt+s://`.
- If using a self-signed certificate, the Neo4j driver supports self-signed TLS schemes, but a trusted certificate is easier to operate.
- Keep the Bolt port closed to the public internet unless there is no safer network path.
- Rotate database credentials when people leave the project or secrets may have been exposed.

### 4. Configure Vercel

Use the same variables as the managed option:

```bash
MEMGRAPH_URI=bolt+s://memgraph.example.com:7687
MEMGRAPH_USER=your-production-user
MEMGRAPH_PASSWORD=your-production-password
```

Redeploy after editing Vercel environment variables.

### 5. Operate the database

Self-hosted production needs an operations plan:

- Backups: schedule and test restores.
- Monitoring: disk usage, memory, CPU, Bolt connection failures, and query latency.
- Upgrades: test Memgraph image upgrades in staging before production.
- Incident response: document who can restart the VM/database and restore from backup.
- Data retention: define whether deleted pages should be recoverable from backup only or soft-deleted in the app later.

## Local development

Run Memgraph locally:

```bash
docker run -p 7687:7687 memgraph/memgraph
```

Create `.env` from the example file:

```bash
cp .env.example .env
```

For the default local Docker command:

```bash
MEMGRAPH_URI=bolt://localhost:7687
MEMGRAPH_USER=
MEMGRAPH_PASSWORD=
```

Run the app through Vercel CLI so `/api/graph/*` functions are available:

```bash
npx vercel dev
```

Plain `npm run dev` starts only Vite. It is useful for frontend work, but graph persistence requires the Vercel API routes unless you also proxy or run the functions separately.

## Production launch checklist

- [ ] Choose managed Memgraph Cloud or a self-hosted VM.
- [ ] Create separate production and staging databases.
- [ ] Confirm the production Bolt endpoint is reachable from Vercel.
- [ ] Use TLS for production Bolt traffic.
- [ ] Store `MEMGRAPH_URI`, `MEMGRAPH_USER`, and `MEMGRAPH_PASSWORD` in Vercel, not in git.
- [ ] Redeploy Vercel after setting environment variables.
- [ ] Create a test page and relationship in production.
- [ ] Confirm `/api/graph/load` returns the created data.
- [ ] Confirm a browser refresh preserves the graph.
- [ ] Configure backups and document restore steps.
- [ ] Configure monitoring/alerts for the database host or managed service.

## Practical recommendation for this project

Start with Memgraph Cloud for production if budget allows. It avoids most operational risk and matches Vercel's serverless model well: Vercel hosts the stateless app and API functions, while Memgraph Cloud hosts the stateful graph database.

If the goal is to avoid a managed database subscription, self-host on a small VM first, but treat that VM as production infrastructure. The app code already expects a standard Bolt endpoint, so switching later from self-hosted Memgraph to Memgraph Cloud is mostly an environment-variable change.

## Reference docs

- Memgraph Cloud: https://memgraph.com/cloud
- Memgraph Docker operations: https://memgraph.com/docs/operations/docker
- Memgraph backup and restore: https://memgraph.com/docs/database-management/backup-and-restore
- Memgraph authentication and authorization: https://memgraph.com/docs/database-management/authentication-and-authorization
- Neo4j JavaScript driver manual: https://neo4j.com/docs/javascript-manual/current/
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Vercel Functions: https://vercel.com/docs/functions
