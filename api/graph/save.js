import neo4j from 'neo4j-driver';

const NODE_PROPS = [
  'id',
  'title',
  'bodyDelta',
  'bodyHtml',
  'visits',
  'createdAt',
  'updatedAt',
];
const EDGE_PROPS = [
  'id',
  'desc',
  'descDelta',
  'descHtml',
  'weight',
  'createdAt',
  'updatedAt',
];

function createDriver() {
  const uri = process.env.MEMGRAPH_URI;
  if (!uri) {
    throw new Error('MEMGRAPH_URI is not configured.');
  }

  const user = process.env.MEMGRAPH_USER || '';
  const password = process.env.MEMGRAPH_PASSWORD || '';
  const auth = user || password
    ? neo4j.auth.basic(user, password)
    : neo4j.auth.none();

  return neo4j.driver(uri, auth, { disableLosslessIntegers: true });
}

function pickProps(source, props) {
  return Object.fromEntries(
    props
      .filter(prop => source[prop] !== undefined)
      .map(prop => [prop, source[prop]])
  );
}

function sanitizedString(value) {
  return typeof value === 'string' ? value : '';
}

function sanitizedNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeNode(node) {
  const safeNode = pickProps(node, NODE_PROPS);
  safeNode.id = sanitizedString(node.id);
  safeNode.title = sanitizedString(node.title);
  safeNode.bodyDelta = sanitizedString(node.bodyDelta);
  safeNode.bodyHtml = sanitizedString(node.bodyHtml);
  safeNode.visits = sanitizedNumber(node.visits);
  safeNode.createdAt = sanitizedNumber(node.createdAt, Date.now());
  safeNode.updatedAt = sanitizedNumber(node.updatedAt, safeNode.createdAt);
  return safeNode.id ? safeNode : null;
}

function sanitizeEdge(edge) {
  const safeEdge = pickProps(edge, EDGE_PROPS);
  safeEdge.id = sanitizedString(edge.id);
  safeEdge.fromId = sanitizedString(edge.fromId);
  safeEdge.toId = sanitizedString(edge.toId);
  safeEdge.desc = sanitizedString(edge.desc);
  safeEdge.descDelta = sanitizedString(edge.descDelta);
  safeEdge.descHtml = sanitizedString(edge.descHtml);
  safeEdge.weight = sanitizedNumber(edge.weight, 5);
  safeEdge.createdAt = sanitizedNumber(edge.createdAt, Date.now());
  safeEdge.updatedAt = sanitizedNumber(edge.updatedAt, safeEdge.createdAt);
  return safeEdge.id && safeEdge.fromId && safeEdge.toId ? safeEdge : null;
}

function edgeProps(edge) {
  return pickProps(edge, EDGE_PROPS);
}

async function readGraphBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let body;
  try {
    body = await readGraphBody(req);
  } catch (error) {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }

  const nodes = Array.isArray(body.nodes)
    ? body.nodes.map(sanitizeNode).filter(Boolean)
    : [];
  const nodeIds = new Set(nodes.map(node => node.id));
  const edges = Array.isArray(body.edges)
    ? body.edges.map(sanitizeEdge).filter(edge => edge && nodeIds.has(edge.fromId) && nodeIds.has(edge.toId))
    : [];
  const edgeRecords = edges.map(edge => ({
    id: edge.id,
    fromId: edge.fromId,
    toId: edge.toId,
    props: edgeProps(edge),
  }));

  let driver;
  let session;
  try {
    driver = createDriver();
    session = driver.session();

    await session.executeWrite(async tx => {
      await tx.run(
        'MATCH ()-[relation:RELATION]->() WHERE NOT relation.id IN $edgeIds DELETE relation',
        { edgeIds: edges.map(edge => edge.id) }
      );
      await tx.run(
        'MATCH (page:Page) WHERE NOT page.id IN $nodeIds DETACH DELETE page',
        { nodeIds: nodes.map(node => node.id) }
      );
      await tx.run(
        'UNWIND $nodes AS node MERGE (page:Page {id: node.id}) SET page += node',
        { nodes }
      );
      await tx.run(
        `
        UNWIND $edges AS edge
        MATCH (from:Page)-[relation:RELATION {id: edge.id}]->(to:Page)
        WHERE from.id <> edge.fromId OR to.id <> edge.toId
        DELETE relation
        `,
        { edges: edgeRecords }
      );
      await tx.run(
        `
        UNWIND $edges AS edge
        MATCH (from:Page {id: edge.fromId})
        MATCH (to:Page {id: edge.toId})
        MERGE (from)-[relation:RELATION {id: edge.id}]->(to)
        SET relation += edge.props
        `,
        { edges: edgeRecords }
      );
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Unable to save graph to Memgraph.', error);
    return res.status(500).json({ error: 'Unable to save graph.' });
  } finally {
    await session?.close();
    await driver?.close();
  }
}
