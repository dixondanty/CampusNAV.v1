const assert = require('node:assert/strict')
const { test } = require('node:test')
const app = require('../server')
const { isApprovedAdminEmail } = require('./auth')
const { isTrustedOrigin } = require('../middleware/adminAuth')

test('only Rajagiri Workspace addresses can be configured as the approved Admin', () => {
  const domain = ['rajagiri', 'edu', 'in'].join('.')
  assert.equal(isApprovedAdminEmail(`sample@${domain}`), true)
  assert.equal(isApprovedAdminEmail(`SAMPLE@${domain.toUpperCase()}`), true)
  assert.equal(isApprovedAdminEmail('sample@example.net'), false)
  assert.equal(isApprovedAdminEmail(`sample@sub.${domain}`), false)
  assert.equal(isApprovedAdminEmail(`sample@${domain}.example.com`), false)
})

test('trusted origins must match a configured frontend origin exactly', (t) => {
  const originalOrigin = process.env.FRONTEND_ORIGIN
  process.env.FRONTEND_ORIGIN = 'https://campus.example.edu'
  t.after(() => {
    if (originalOrigin === undefined) {
      delete process.env.FRONTEND_ORIGIN
    } else {
      process.env.FRONTEND_ORIGIN = originalOrigin
    }
  })

  assert.equal(isTrustedOrigin('https://campus.example.edu'), true)
  assert.equal(isTrustedOrigin('https://attacker.example.edu'), false)
  assert.equal(isTrustedOrigin(undefined), false)
})

test('all Admin API mutation routes reject requests without a session', async (t) => {
  const server = app.listen(0)
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  })
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  const requests = [
    ['GET', '/api/auth/admin/session'],
    ['POST', '/api/buildings'],
    ['PATCH', '/api/buildings/000000000000000000000001'],
    ['DELETE', '/api/buildings/000000000000000000000001'],
    ['POST', '/api/floors'],
    ['PATCH', '/api/floors/000000000000000000000001/image'],
    ['DELETE', '/api/floors/000000000000000000000001'],
    ['POST', '/api/nodes'],
    ['PATCH', '/api/nodes/000000000000000000000001'],
    ['DELETE', '/api/nodes/000000000000000000000001'],
    ['POST', '/api/connections'],
    ['DELETE', '/api/connections/000000000000000000000001'],
    ['POST', '/api/cabins'],
    ['PATCH', '/api/cabins/000000000000000000000001'],
    ['DELETE', '/api/cabins/000000000000000000000001'],
  ]

  for (const [method, path] of requests) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
    })
    assert.equal(response.status, 401, `${method} ${path} should require an Admin session`)
  }

  for (const path of ['/api/auth/admin/google', '/api/auth/admin/logout']) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://untrusted.example',
      },
      body: '{}',
    })
    assert.equal(response.status, 403, `${path} should reject an untrusted origin`)
  }
})
