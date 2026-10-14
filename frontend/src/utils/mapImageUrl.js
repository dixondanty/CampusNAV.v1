export default function mapImageUrl(serverUrl, mapImage) {
  if (!mapImage) {
    return ''
  }
  if (/^https?:\/\//i.test(mapImage)) {
    return mapImage
  }
  return `${serverUrl.replace(/\/$/, '')}/${mapImage.replace(/^\//, '')}`
}
