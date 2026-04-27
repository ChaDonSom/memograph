function emptyGraph() {
  return { nodes: [], edges: [] };
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeGraph(value) {
  if (!value || typeof value !== 'object') return emptyGraph();

  return {
    nodes: arrayOrEmpty(value.nodes),
    edges: arrayOrEmpty(value.edges),
  };
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error('API returned invalid JSON.', { cause: error });
  }
}

export async function loadGraph() {
  const response = await fetch('/api/graph/load');
  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error || 'Unable to load graph.');
  }
  return normalizeGraph(data);
}

export async function saveGraph(nodes, edges) {
  const response = await fetch('/api/graph/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodes, edges }),
  });
  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error || 'Unable to save graph.');
  }
  return data;
}

export { emptyGraph };
