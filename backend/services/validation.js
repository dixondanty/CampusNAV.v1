// Pure, database-free validation predicates shared by the node and connection
// routes. These functions accept plain values (never Mongoose documents) so
// they can be unit-tested with Node's built-in test runner and no database.
//
// Each predicate mirrors the exact condition previously written inline in the
// routes; the routes keep their original ordering, status codes, and messages.

function normalizeBuildingConnectionFields(connectionType, connectionGroup) {
  const normalizedType = typeof connectionType === 'string' ? connectionType.trim() : ''
  const normalizedGroup = typeof connectionGroup === 'string' ? connectionGroup.trim() : ''

  if (!normalizedType || !normalizedGroup) {
    return {
      connectionType: normalizedType,
      connectionGroup: normalizedGroup,
      error: 'Building connection type and group are required.',
    }
  }

  if (normalizedType !== 'skywalk' && normalizedType !== 'entrance') {
    return {
      connectionType: normalizedType,
      connectionGroup: normalizedGroup,
      error: 'Unsupported building connection type.',
    }
  }

  return { connectionType: normalizedType, connectionGroup: normalizedGroup, error: null }
}

function isSameFloorConnectionAllowed(fromType, toType, fromStairPart, toStairPart) {
  const bothNavigation = fromType === 'nav' && toType === 'nav'
  const roomNavigation =
    (fromType === 'room' && toType === 'nav') ||
    (fromType === 'nav' && toType === 'room')
  const navigationStair =
    (fromType === 'nav' && toType === 'stair') ||
    (toType === 'nav' && fromType === 'stair')
  const navigationBuildingConnection =
    (fromType === 'nav' && toType === 'buildingConnection') ||
    (toType === 'nav' && fromType === 'buildingConnection')
  const oppositeStairParts =
    fromType === 'stair' && toType === 'stair' && fromStairPart !== toStairPart

  return Boolean(
    bothNavigation ||
      roomNavigation ||
      navigationStair ||
      navigationBuildingConnection ||
      oppositeStairParts,
  )
}

function isSkywalkEndpointPair(fromType, toType) {
  return fromType === 'buildingConnection' && toType === 'buildingConnection'
}

function skywalkFloorsValid(fromContext, fromBuildingId, toContext, toBuildingId) {
  return (
    fromContext === 'building' &&
    toContext === 'building' &&
    Boolean(fromBuildingId) &&
    Boolean(toBuildingId)
  )
}

function entranceFloorsValid(fromContext, fromBuildingId, toContext, toBuildingId) {
  const fromCampus = fromContext === 'campus' && !fromBuildingId
  const toCampus = toContext === 'campus' && !toBuildingId
  const fromBuilding = fromContext === 'building' && Boolean(fromBuildingId)
  const toBuilding = toContext === 'building' && Boolean(toBuildingId)

  return (fromCampus && toBuilding) || (fromBuilding && toCampus)
}

function entranceEndpointsMatch(fromType, toType, fromConnectionGroup, toConnectionGroup) {
  const fromGroup = typeof fromConnectionGroup === 'string' ? fromConnectionGroup.trim() : ''
  const toGroup = typeof toConnectionGroup === 'string' ? toConnectionGroup.trim() : ''
  return (
    fromType === 'entrance' &&
    toType === 'entrance' &&
    Boolean(fromGroup) &&
    fromGroup === toGroup
  )
}

function shareSameBuildingId(firstBuildingId, secondBuildingId) {
  if (!firstBuildingId || !secondBuildingId) {
    return false
  }
  return String(firstBuildingId) === String(secondBuildingId)
}

function skywalkEndpointsMatch(fromType, toType, fromConnectionGroup, toConnectionGroup) {
  const fromGroup = typeof fromConnectionGroup === 'string' ? fromConnectionGroup.trim() : ''
  const toGroup = typeof toConnectionGroup === 'string' ? toConnectionGroup.trim() : ''
  return (
    fromType === 'skywalk' &&
    toType === 'skywalk' &&
    Boolean(fromGroup) &&
    fromGroup === toGroup
  )
}

function isValidCrossBuildingDistance(distance) {
  return typeof distance === 'number' && Number.isFinite(distance) && distance >= 0
}

function stairConnectionMatches(
  upperFloorNumber,
  lowerFloorNumber,
  lowerStairPart,
  upperStairPart,
  lowerStairGroup,
  upperStairGroup,
) {
  return (
    upperFloorNumber - lowerFloorNumber === 1 &&
    lowerStairPart === 2 &&
    upperStairPart === 1 &&
    lowerStairGroup === upperStairGroup
  )
}

function resolveConnectionDistance(explicitDistance, fromX, fromY, toX, toY) {
  if (explicitDistance !== undefined) {
    return explicitDistance
  }
  return Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2))
}

module.exports = {
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
}
