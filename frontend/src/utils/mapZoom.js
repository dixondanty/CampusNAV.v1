export const MIN_MAP_ZOOM = 0.75
export const MAX_MAP_ZOOM = 9
export const MAP_ZOOM_STEP = 0.15

export function clampMapZoom(value, max = MAX_MAP_ZOOM) {
  return Math.max(MIN_MAP_ZOOM, Math.min(max, value))
}

export function calculateMaxMapZoom({
  naturalWidth,
  naturalHeight,
  clientWidth,
  clientHeight,
  devicePixelRatio = 1,
  max = MAX_MAP_ZOOM,
}) {
  if (
    !naturalWidth ||
    !naturalHeight ||
    !clientWidth ||
    !clientHeight ||
    naturalWidth <= 0 ||
    naturalHeight <= 0 ||
    clientWidth <= 0 ||
    clientHeight <= 0
  ) {
    return 1
  }

  const effectiveDevicePixelRatio = Math.max(
    1,
    Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1,
  )
  const widthCapacity = naturalWidth / (clientWidth * effectiveDevicePixelRatio)
  const heightCapacity = naturalHeight / (clientHeight * effectiveDevicePixelRatio)
  const sourceLimitedZoom = Math.min(widthCapacity, heightCapacity)

  if (!Number.isFinite(sourceLimitedZoom) || sourceLimitedZoom <= 0) {
    return 1
  }

  return clampMapZoom(
    Math.min(max, Math.max(1, sourceLimitedZoom)),
    max,
  )
}
