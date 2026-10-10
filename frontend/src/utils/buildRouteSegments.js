function defaultFloorIdOf(node) {
  const floorId = node && typeof node === 'object' && node.floorId
  return String(floorId && typeof floorId === 'object' ? floorId._id : floorId)
}

function buildRouteSegments(path, floorIdOf = defaultFloorIdOf) {
  if (!Array.isArray(path) || path.length === 0) {
    return []
  }
  const segments = []
  let currentNodes = [path[0]]
  for (let index = 1; index < path.length; index += 1) {
    const node = path[index]
    if (floorIdOf(node) === floorIdOf(path[index - 1])) {
      currentNodes.push(node)
    } else {
      segments.push({ nodes: currentNodes })
      currentNodes = [node]
    }
  }
  segments.push({ nodes: currentNodes })
  return segments
}

export default buildRouteSegments