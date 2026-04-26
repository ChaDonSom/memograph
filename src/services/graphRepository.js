const STORAGE_KEY = 'memograph_v2';

function emptyGraph() {
  return { nodes: [], edges: [] };
}

function normalizeGraph(value) {
  if (!value || typeof value !== 'object') return emptyGraph();

  return {
    nodes: Array.isArray(value.nodes) ? value.nodes : [],
    edges: Array.isArray(value.edges) ? value.edges : [],
  };
}

export function loadGraph() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyGraph();

  try {
    return normalizeGraph(JSON.parse(raw));
  } catch (error) {
    console.warn('Unable to load saved Memograph data from localStorage.', error);
    return emptyGraph();
  }
}

export function saveGraph(nodes, edges) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges }));
}
