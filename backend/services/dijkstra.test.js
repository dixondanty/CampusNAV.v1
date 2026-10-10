const test = require('node:test')
const assert = require('node:assert/strict')

const runDijkstra = require('./dijkstra')

function node(id, name = id) {
  return { _id: id, name }
}

function edge(from, to, distance) {
  return { from, to, distance }
}

function ids(result) {
  return result.path.map((item) => item._id)
}

test('finds a valid same-floor route', () => {
  const nodes = [node('A'), node('B'), node('C')]
  const connections = [edge('A', 'B', 1), edge('B', 'C', 1)]

  const result = runDijkstra('A', 'C', nodes, connections)

  assert.equal(result.found, true)
  assert.equal(result.distance, 2)
  assert.deepEqual(ids(result), ['A', 'B', 'C'])
})

test('returns the lowest total distance rather than the fewest edges', () => {
  const nodes = [node('A'), node('B'), node('C'), node('D')]
  const connections = [
    edge('A', 'D', 10),
    edge('A', 'B', 1),
    edge('B', 'C', 1),
    edge('C', 'D', 1),
  ]

  const result = runDijkstra('A', 'D', nodes, connections)

  assert.equal(result.found, true)
  assert.equal(result.distance, 3)
  assert.deepEqual(ids(result), ['A', 'B', 'C', 'D'])
})

test('routes across a multi-floor-style graph with explicit stair edges', () => {
  const nodes = [
    node('f1-room'),
    node('f1-stair-p2'),
    node('f2-stair-p1'),
    node('f2-room'),
  ]
  const connections = [
    edge('f1-room', 'f1-stair-p2', 1),
    edge('f1-stair-p2', 'f2-stair-p1', 2),
    edge('f2-stair-p1', 'f2-room', 1),
  ]

  const result = runDijkstra('f1-room', 'f2-room', nodes, connections)

  assert.equal(result.found, true)
  assert.equal(result.distance, 4)
  assert.deepEqual(
    ids(result),
    ['f1-room', 'f1-stair-p2', 'f2-stair-p1', 'f2-room'],
  )
})

test('reports no route for an unreachable destination', () => {
  const nodes = [node('A'), node('B'), node('C')]
  const connections = [edge('A', 'B', 1)]

  const result = runDijkstra('A', 'C', nodes, connections)

  assert.equal(result.found, false)
  assert.deepEqual(result.path, [])
  assert.equal(result.distance, null)
})

test('reports no route when the start or destination node is missing', () => {
  const nodes = [node('A'), node('B')]
  const connections = [edge('A', 'B', 1)]

  const missingDestination = runDijkstra('A', 'X', nodes, connections)
  const missingStart = runDijkstra('X', 'A', nodes, connections)

  assert.equal(missingDestination.found, false)
  assert.equal(missingStart.found, false)
})

test('traverses connections in both directions', () => {
  const nodes = [node('A'), node('B')]
  const connections = [edge('A', 'B', 2)]

  const result = runDijkstra('B', 'A', nodes, connections)

  assert.equal(result.found, true)
  assert.equal(result.distance, 2)
  assert.deepEqual(ids(result), ['B', 'A'])
})

test('handles empty and disconnected graphs', () => {
  const empty = runDijkstra('A', 'B', [], [])
  assert.equal(empty.found, false)
  assert.deepEqual(empty.path, [])
  assert.equal(empty.distance, null)

  const noConnections = runDijkstra('A', 'B', [node('A'), node('B')], [])
  assert.equal(noConnections.found, false)
})

test('ignores unusable edge weights and unknown endpoints', () => {
  const nodes = [node('A'), node('B'), node('C')]

  const negative = runDijkstra('A', 'C', nodes, [edge('A', 'B', 1), edge('B', 'C', -5)])
  assert.equal(negative.found, false)

  const notANumber = runDijkstra('A', 'C', nodes, [edge('A', 'B', 1), edge('B', 'C', Number.NaN)])
  assert.equal(notANumber.found, false)

  const infinite = runDijkstra('A', 'C', nodes, [edge('A', 'B', 1), edge('B', 'C', Infinity)])
  assert.equal(infinite.found, false)

  const unknownEndpoint = runDijkstra('A', 'B', nodes, [edge('A', 'ZZZ', 1)])
  assert.equal(unknownEndpoint.found, false)
})

test('accepts numeric string edge weights via existing Number() coercion', () => {
  const nodes = [node('A'), node('B'), node('C')]
  const connections = [edge('A', 'B', '1'), edge('B', 'C', '2')]

  const result = runDijkstra('A', 'C', nodes, connections)

  assert.equal(result.found, true)
  assert.equal(result.distance, 3)
  assert.deepEqual(ids(result), ['A', 'B', 'C'])
})
