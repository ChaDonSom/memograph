export const DEFAULT_EDGE_WEIGHT = 5;

const MS_PER_DAY = 86_400_000;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function createNodeRecord(title = '') {
  const now = Date.now();

  return {
    id: uid(),
    title,
    bodyDelta: '',
    bodyHtml: '',
    visits: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createEdgeRecord(fromId, toId, desc = '', weight = DEFAULT_EDGE_WEIGHT) {
  return {
    id: uid(),
    fromId,
    toId,
    desc,
    weight,
  };
}

export function findNodeById(nodes, id) {
  return nodes.find(node => node.id === id) ?? null;
}

export function sortByUpdatedDesc(a, b) {
  return (b.updatedAt || 0) - (a.updatedAt || 0);
}

export function splitRelationDescription(desc = '') {
  const [label = '', ...detailLines] = desc.replace(/\r\n/g, '\n').split('\n');
  return {
    label: label.trim(),
    detail: detailLines.join('\n').replace(/\s+$/, ''),
  };
}

export function priorityScore(edge, target) {
  const weight = (edge.weight || DEFAULT_EDGE_WEIGHT) * 3;
  const popularity = Math.log2((target.visits || 0) + 1) * 2;
  const daysSinceUpdate = (Date.now() - (target.updatedAt || 0)) / MS_PER_DAY;
  const recency = 8 * Math.exp(-daysSinceUpdate / 7);
  return weight + popularity + recency;
}
