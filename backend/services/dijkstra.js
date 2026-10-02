function runDijkstra(startNodeId, endNodeId, nodes, connections) {
  const nodeById = new Map(nodes.map((node) => [String(node._id), node]))
  const startId = String(startNodeId)
  const endId = String(endNodeId)

  if (!nodeById.has(startId) || !nodeById.has(endId)) {
    return { found: false, path: [], distance: null }
  }

  const neighbors = new Map(nodes.map((node) => [String(node._id), []]))
  for (const connection of connections) {
    const fromId = String(connection.from)
    const toId = String(connection.to)
    const edgeDistance = Number(connection.distance)
    if (
      !neighbors.has(fromId) ||
      !neighbors.has(toId) ||
      !Number.isFinite(edgeDistance) ||
      edgeDistance < 0
    ) {
      continue
    }

    neighbors.get(fromId).push({ nodeId: toId, distance: edgeDistance })
    neighbors.get(toId).push({ nodeId: fromId, distance: edgeDistance })
  }

  const distances = new Map(nodes.map((node) => [String(node._id), Infinity]))
  const previousNodes = new Map()
  const visited = new Set()
  distances.set(startId, 0)

  while (visited.size < nodes.length) {
    let currentId = null
    let shortestDistance = Infinity

    for (const [nodeId, distance] of distances) {
      if (!visited.has(nodeId) && distance < shortestDistance) {
        currentId = nodeId
        shortestDistance = distance
      }
    }

    if (currentId === null) {
      break
    }

    if (currentId === endId) {
      break
    }

    visited.add(currentId)

    for (const neighbor of neighbors.get(currentId)) {
      if (visited.has(neighbor.nodeId)) {
        continue
      }

      const alternativeDistance = shortestDistance + neighbor.distance
      if (alternativeDistance < distances.get(neighbor.nodeId)) {
        distances.set(neighbor.nodeId, alternativeDistance)
        previousNodes.set(neighbor.nodeId, currentId)
      }
    }
  }

  const totalDistance = distances.get(endId)
  if (!Number.isFinite(totalDistance)) {
    return { found: false, path: [], distance: null }
  }

  const path = []
  let currentId = endId
  while (currentId !== undefined) {
    path.unshift(nodeById.get(currentId))
    if (currentId === startId) {
      break
    }
    currentId = previousNodes.get(currentId)
  }

  return { found: true, path, distance: totalDistance }
}

module.exports = runDijkstra
