const assert = require('node:assert/strict')
const http = require('node:http')
const test = require('node:test')

const testUri = process.env.TEST_MONGODB_URI
let integrationError = null
let databaseName = ''
if (testUri) {
  try {
    databaseName = new URL(testUri).pathname.replace(/^\/+/, '')
  } catch (error) {
    integrationError = new Error('TEST_MONGODB_URI must be a valid MongoDB URI.')
  }
  if (!databaseName || !/test/i.test(databaseName)) {
    integrationError = new Error('TEST_MONGODB_URI must target an explicitly named test database.')
  }
}

const integrationOptions = {
  skip: !testUri || Boolean(integrationError),
}

if (integrationError) {
  throw integrationError
}

process.env.GRIDFS_BUCKET_NAME = `floorPlansTest_${process.pid}`

const mongoose = require('mongoose')
const app = require('../server')
const Building = require('../models/Building')
const Floor = require('../models/Floor')

let server
let baseUrl
let building

function imageForm(name, bytes, type) {
  const form = new FormData()
  form.append('name', name)
  form.append('floorNumber', '1')
  form.append('context', 'building')
  form.append('buildingId', building._id.toString())
  form.append('mapImage', new Blob([bytes], { type }), `${name}.image`)
  return form
}

async function readResponse(response) {
  const body = await response.arrayBuffer()
  return { body: Buffer.from(body), contentType: response.headers.get('content-type') }
}

test.before(async (context) => {
  if (integrationOptions.skip) {
    context.skip('Set TEST_MONGODB_URI to a database whose name includes "test" to run HTTP GridFS tests.')
    return
  }
  await mongoose.connect(testUri)
  await mongoose.connection.dropDatabase()
  building = await Building.create({ name: 'GridFS test building' })
  server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

test.after(async (context) => {
  if (integrationOptions.skip) {
    context.skip()
    return
  }
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('uploads and retrieves PNG and JPEG bytes over HTTP', integrationOptions, async () => {
  const cases = [
    ['png-floor', Buffer.from('png-test-bytes'), 'image/png'],
    ['jpeg-floor', Buffer.from('jpeg-test-bytes'), 'image/jpeg'],
  ]
  for (const [name, bytes, type] of cases) {
    const createResponse = await fetch(`${baseUrl}/api/floors`, {
      method: 'POST',
      body: imageForm(name, bytes, type),
    })
    assert.equal(createResponse.status, 201)
    const floor = await createResponse.json()
    const imageResponse = await fetch(`${baseUrl}${floor.mapImage}`)
    const image = await readResponse(imageResponse)
    assert.equal(imageResponse.status, 200)
    assert.equal(image.contentType, type)
    assert.deepEqual(image.body, bytes)
    assert.equal(imageResponse.headers.get('cache-control'), 'no-store')
  }
})

test('handles invalid and missing image requests', integrationOptions, async () => {
  assert.equal((await fetch(`${baseUrl}/api/floors/not-an-id/image`)).status, 400)
  assert.equal((await fetch(`${baseUrl}/api/floors/${new mongoose.Types.ObjectId()}/image`)).status, 404)
})

test('replaces an image without changing the floor identity or shared old file', integrationOptions, async () => {
  const original = Buffer.from('original-image')
  const replacement = Buffer.from('replacement-image')
  const createResponse = await fetch(`${baseUrl}/api/floors`, {
    method: 'POST',
    body: imageForm('replacement-floor', original, 'image/png'),
  })
  const floor = await createResponse.json()
  const originalFileId = floor.mapImageFileId
  const sharedFloor = await Floor.create({
    name: 'shared-image-floor',
    context: 'building',
    buildingId: building._id,
    floorNumber: 99,
    mapImage: floor.mapImage,
    mapImageFileId: originalFileId,
  })

  const replaceForm = new FormData()
  replaceForm.append('mapImage', new Blob([replacement], { type: 'image/jpeg' }), 'replacement.jpg')
  const replaceResponse = await fetch(`${baseUrl}/api/floors/${floor._id}/image`, {
    method: 'PATCH',
    body: replaceForm,
  })
  const updated = await replaceResponse.json()
  assert.equal(replaceResponse.status, 200)
  assert.equal(updated._id, floor._id)
  assert.notEqual(updated.mapImageFileId, originalFileId)

  const sharedImageResponse = await fetch(`${baseUrl}${sharedFloor.mapImage}`)
  assert.equal(sharedImageResponse.status, 200)
  assert.deepEqual((await readResponse(sharedImageResponse)).body, original)
})

test('serves concurrent image retrievals', integrationOptions, async () => {
  const floor = await Floor.findOne({ name: 'png-floor' })
  const responses = await Promise.all(
    Array.from({ length: 10 }, () => fetch(`${baseUrl}${floor.mapImage}`)),
  )
  assert.equal(responses.every((response) => response.status === 200), true)
  await Promise.all(responses.map((response) => response.arrayBuffer()))
})
