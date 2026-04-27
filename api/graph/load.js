import neo4j from 'neo4j-driver';

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

function graphNode(record) {
  return record.get('page').properties;
}

function graphEdge(record) {
  const relation = record.get('relation').properties;
  return {
    ...relation,
    fromId: record.get('fromId'),
    toId: record.get('toId'),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let driver;
  let session;
  try {
    driver = createDriver();
    session = driver.session();

    const nodeResult = await session.run('MATCH (page:Page) RETURN page ORDER BY page.updatedAt DESC');
    const edgeResult = await session.run(`
        MATCH (from:Page)-[relation:RELATION]->(to:Page)
        RETURN relation, from.id AS fromId, to.id AS toId
        ORDER BY relation.createdAt ASC, relation.id ASC
      `);

    return res.status(200).json({
      nodes: nodeResult.records.map(graphNode),
      edges: edgeResult.records.map(graphEdge),
    });
  } catch (error) {
    console.error('Unable to load graph from Memgraph.', error);
    return res.status(500).json({ error: 'Unable to load graph.' });
  } finally {
    await session?.close();
    await driver?.close();
  }
}
