const test = require('node:test')
const assert = require('node:assert/strict')

const Node = require('../models/Node')
const {
  normalizeBuildingConnectionFields,
  isSameFloorConnectionAllowed,
  isSkywalkEndpointPair,
  skywalkFloorsValid,
  entranceFloorsValid,
  entranceEndpointsMatch,
  shareSameBuildingId,
  skywalkEndpointsMatch,
  isValidCrossBuildingDistance,
  stairConnectionMatches,
  resolveConnectionDistance,
} = require('./validation')

const FLOOR_ID = '507f1f77bcf86cd799439011'

// A. BuildingConnection fields

test('accepts a valid skywalk type with a non-empty group', () => {
  const result = normalizeBuildingConnectionFields('skywalk', 'B12')
  assert.equal(result.error, null)
  assert.equal(result.connectionType, 'skywalk')
  assert.equal(result.connectionGroup, 'B12')
})

test('trims connection type and group', () => {
  const result = normalizeBuildingConnectionFields('  skywalk  ', '  Group A  ')
  assert.equal(result.error, null)
  assert.equal(result.connectionType, 'skywalk')
  assert.equal(result.connectionGroup, 'Group A')
})

test('rejects missing, empty, whitespace-only, or non-string type', () => {
  for (const value of [undefined, null, '', '   ', 123, {}]) {
    assert.equal(
      normalizeBuildingConnectionFields(value, 'G').error,
      'Building connection type and group are required.',
    )
  }
})

test('rejects missing, empty, whitespace-only, or non-string group', () => {
  for (const value of [undefined, null, '', '   ', 123, {}]) {
    assert.equal(
      normalizeBuildingConnectionFields('skywalk', value).error,
      'Building connection type and group are required.',
    )
  }
})

test('rejects an unsupported connection type', () => {
  const result = normalizeBuildingConnectionFields('elevator', 'G')
  assert.equal(result.error, 'Unsupported building connection type.')
  assert.equal(result.connectionType, 'elevator')
})

// B. Same-floor connection allow-list

test('permits nav-nav, room-nav, and nav-buildingConnection in both orders', () => {
  assert.equal(isSameFloorConnectionAllowed('nav', 'nav'), true)
  assert.equal(isSameFloorConnectionAllowed('room', 'nav'), true)
  assert.equal(isSameFloorConnectionAllowed('nav', 'room'), true)
  assert.equal(isSameFloorConnectionAllowed('nav', 'buildingConnection'), true)
  assert.equal(isSameFloorConnectionAllowed('buildingConnection', 'nav'), true)
  assert.equal(isSameFloorConnectionAllowed('nav', 'stair'), true)
  assert.equal(isSameFloorConnectionAllowed('stair', 'nav'), true)
})

test('rejects room-buildingConnection and stair-buildingConnection in both orders', () => {
  assert.equal(isSameFloorConnectionAllowed('room', 'buildingConnection'), false)
  assert.equal(isSameFloorConnectionAllowed('buildingConnection', 'room'), false)
  assert.equal(isSameFloorConnectionAllowed('stair', 'buildingConnection'), false)
  assert.equal(isSameFloorConnectionAllowed('buildingConnection', 'stair'), false)
})

test('permits opposite stair parts and rejects matching stair parts on the same floor', () => {
  assert.equal(isSameFloorConnectionAllowed('stair', 'stair', 1, 2), true)
  assert.equal(isSameFloorConnectionAllowed('stair', 'stair', 2, 1), true)
  assert.equal(isSameFloorConnectionAllowed('stair', 'stair', 1, 1), false)
  assert.equal(isSameFloorConnectionAllowed('stair', 'stair', 2, 2), false)
})

// C. Skywalk cross-building rules

test('requires both endpoints to be buildingConnection nodes', () => {
  assert.equal(isSkywalkEndpointPair('buildingConnection', 'buildingConnection'), true)
  assert.equal(isSkywalkEndpointPair('buildingConnection', 'nav'), false)
  assert.equal(isSkywalkEndpointPair('nav', 'buildingConnection'), false)
  assert.equal(isSkywalkEndpointPair('stair', 'stair'), false)
})

test('rejects campus and unassigned floors as skywalk endpoints', () => {
  assert.equal(skywalkFloorsValid('building', 'b1', 'building', 'b2'), true)
  assert.equal(skywalkFloorsValid('campus', 'b1', 'building', 'b2'), false)
  assert.equal(skywalkFloorsValid('building', 'b1', 'campus', 'b2'), false)
  assert.equal(skywalkFloorsValid('building', undefined, 'building', 'b2'), false)
  assert.equal(skywalkFloorsValid('building', 'b1', 'building', null), false)
})

test('shareSameBuildingId compares ids and rejects missing ids', () => {
  assert.equal(shareSameBuildingId('b1', 'b1'), true)
  assert.equal(shareSameBuildingId('b1', 'b2'), false)
  assert.equal(shareSameBuildingId(null, 'b1'), false)
  assert.equal(shareSameBuildingId('b1', undefined), false)
})

test('requires skywalk type and non-empty matching groups', () => {
  assert.equal(skywalkEndpointsMatch('skywalk', 'skywalk', 'G', 'G'), true)
  assert.equal(skywalkEndpointsMatch('skywalk', 'skywalk', '  G  ', 'G'), true)
  assert.equal(skywalkEndpointsMatch('skywalk', 'skywalk', 'G', 'H'), false)
  assert.equal(skywalkEndpointsMatch('skywalk', 'skywalk', '', 'G'), false)
  assert.equal(skywalkEndpointsMatch('skywalk', 'skywalk', '   ', '   '), false)
  assert.equal(skywalkEndpointsMatch('elevator', 'skywalk', 'G', 'G'), false)
  assert.equal(skywalkEndpointsMatch('skywalk', 'skywalk', undefined, undefined), false)
})

test('accepts only finite non-negative numeric cross-building distances', () => {
  assert.equal(isValidCrossBuildingDistance(0), true)
  assert.equal(isValidCrossBuildingDistance(12.5), true)
  assert.equal(isValidCrossBuildingDistance(-1), false)
  assert.equal(isValidCrossBuildingDistance(Number.NaN), false)
  assert.equal(isValidCrossBuildingDistance(Infinity), false)
  assert.equal(isValidCrossBuildingDistance(-Infinity), false)
  assert.equal(isValidCrossBuildingDistance('5'), false)
  assert.equal(isValidCrossBuildingDistance(undefined), false)
})

test('preserves an explicit cross-map distance and otherwise uses coordinates', () => {
  assert.equal(resolveConnectionDistance(42, 0, 0, 100, 100), 42)
  assert.equal(resolveConnectionDistance(0, 0, 0, 100, 100), 0)
  assert.equal(resolveConnectionDistance(undefined, 0, 0, 3, 4), 5)
})

// D. Stair rules

test('accepts adjacent Part 2 to Part 1 stair connections with matching groups', () => {
  assert.equal(stairConnectionMatches(8, 7, 2, 1, 'G', 'G'), true)
  assert.equal(stairConnectionMatches(2, 1, 2, 1, '', ''), true)
})

test('rejects non-adjacent floors, wrong parts, and mismatched groups', () => {
  assert.equal(stairConnectionMatches(9, 7, 2, 1, 'G', 'G'), false)
  assert.equal(stairConnectionMatches(7, 7, 2, 1, 'G', 'G'), false)
  assert.equal(stairConnectionMatches(8, 7, 1, 1, 'G', 'G'), false)
  assert.equal(stairConnectionMatches(8, 7, 2, 2, 'G', 'G'), false)
  assert.equal(stairConnectionMatches(8, 7, 2, 1, 'G', 'H'), false)
})

// E. Ordinary behavior (schema-level, in-memory validation only; no database)

test('nav, room, and stair nodes validate without skywalk fields', async () => {
  await assert.doesNotReject(
    new Node({ name: 'N1', type: 'nav', x: 0, y: 0, floorId: FLOOR_ID }).validate(),
  )
  await assert.doesNotReject(
    new Node({ name: 'R1', type: 'room', x: 0, y: 0, floorId: FLOOR_ID }).validate(),
  )
  await assert.doesNotReject(
    new Node({ name: 'S1', type: 'stair', stairPart: 1, x: 0, y: 0, floorId: FLOOR_ID }).validate(),
  )
})

test('buildingConnection nodes require connectionType and connectionGroup', async () => {
  await assert.rejects(
    new Node({ name: 'BC1', type: 'buildingConnection', x: 0, y: 0, floorId: FLOOR_ID }).validate(),
  )
})

// F. Entrance cross-map rules

test('accepts an entrance type with a non-empty group', () => {
  const result = normalizeBuildingConnectionFields('entrance', 'MainGate')
  assert.equal(result.error, null)
  assert.equal(result.connectionType, 'entrance')
  assert.equal(result.connectionGroup, 'MainGate')
})

test('rejects unsupported connection types (the Entrance-tool 400 regression)', () => {
  // Reproduces the exact route call that surfaced "Unsupported building
  // connection type." in the UI: the Entrance tool POSTs connectionType
  // "entrance" with a non-empty group, and this branch must not reject it.
  const valid = normalizeBuildingConnectionFields('entrance', 'MainGate')
  assert.equal(valid.error, null)
  assert.equal(valid.connectionType, 'entrance')
  assert.equal(valid.connectionGroup, 'MainGate')

  for (const value of ['elevator', 'bridge', 'doorway', 'mainGate', 'entrances']) {
    const result = normalizeBuildingConnectionFields(value, 'G')
    assert.equal(result.error, 'Unsupported building connection type.')
    assert.equal(result.connectionType, value)
  }

  assert.equal(normalizeBuildingConnectionFields('', 'G').error, 'Building connection type and group are required.')
  assert.equal(normalizeBuildingConnectionFields(undefined, 'G').error, 'Building connection type and group are required.')
  assert.equal(normalizeBuildingConnectionFields('entrance', '   ').error, 'Building connection type and group are required.')
})

test('accepts exactly one campus layer (no buildingId) and one assigned building floor', () => {
  assert.equal(entranceFloorsValid('campus', undefined, 'building', 'b1'), true)
  assert.equal(entranceFloorsValid('building', 'b1', 'campus', undefined), true)
})

test('rejects campus-campus, building-building, and invalid contexts for entrance', () => {
  assert.equal(entranceFloorsValid('campus', undefined, 'campus', undefined), false)
  assert.equal(entranceFloorsValid('building', 'b1', 'building', 'b2'), false)
  assert.equal(entranceFloorsValid('campus', 'b1', 'building', 'b2'), false)
  assert.equal(entranceFloorsValid('campus', undefined, 'building', undefined), false)
  assert.equal(entranceFloorsValid('campus', undefined, 'building', null), false)
  assert.equal(entranceFloorsValid('campus', undefined, 'building', ''), false)
})

test('requires matching entrance types and non-empty matching groups', () => {
  assert.equal(entranceEndpointsMatch('entrance', 'entrance', 'G', 'G'), true)
  assert.equal(entranceEndpointsMatch('entrance', 'entrance', '  G  ', 'G'), true)
  assert.equal(entranceEndpointsMatch('entrance', 'entrance', 'G', 'H'), false)
  assert.equal(entranceEndpointsMatch('entrance', 'entrance', '', 'G'), false)
  assert.equal(entranceEndpointsMatch('entrance', 'entrance', '   ', '   '), false)
  assert.equal(entranceEndpointsMatch('entrance', 'entrance', undefined, undefined), false)
})

test('entrance and skywalk types do not mix', () => {
  assert.equal(entranceEndpointsMatch('entrance', 'skywalk', 'G', 'G'), false)
  assert.equal(entranceEndpointsMatch('skywalk', 'entrance', 'G', 'G'), false)
  assert.equal(entranceEndpointsMatch('skywalk', 'skywalk', 'G', 'G'), false)
})

test('entrance buildingConnection nodes validate with the required fields', async () => {
  await assert.rejects(
    new Node({ name: 'E1', type: 'buildingConnection', x: 0, y: 0, floorId: FLOOR_ID }).validate(),
  )
  await assert.doesNotReject(
    new Node({
      name: 'E2',
      type: 'buildingConnection',
      connectionType: 'entrance',
      connectionGroup: 'MainGate',
      x: 0,
      y: 0,
      floorId: FLOOR_ID,
    }).validate(),
  )
})
