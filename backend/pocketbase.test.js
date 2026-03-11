const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeDataPath,
  decodeTokenPayload,
  sanitizeSelfUserWrite,
  generatePocketBaseCredentials
} = require('./pocketbase');

test('normalizeDataPath trims duplicate separators', () => {
  assert.equal(normalizeDataPath('/people//123/'), 'people/123');
  assert.equal(normalizeDataPath(''), '');
});

test('decodeTokenPayload decodes base64url JWT payloads', () => {
  const payload = { id: 'abc123', type: 'auth' };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const decoded = decodeTokenPayload(`x.${encoded}.y`);
  assert.deepEqual(decoded, payload);
});

test('sanitizeSelfUserWrite strips admin flags but keeps editable profile fields', () => {
  const sanitized = sanitizeSelfUserWrite({
    firstName: 'Ada',
    lastName: 'Lovelace',
    emailNotifications: false,
    admin: true,
    superAdmin: true
  });

  assert.deepEqual(sanitized, {
    firstName: 'Ada',
    lastName: 'Lovelace',
    emailNotifications: false,
    name: 'Ada Lovelace'
  });
});

test('generatePocketBaseCredentials returns docker-local defaults', () => {
  const credentials = generatePocketBaseCredentials();
  assert.equal(credentials.url, 'http://127.0.0.1:8090');
  assert.match(credentials.adminEmail, /^nova-.*@local\.invalid$/);
  assert.ok(credentials.adminPassword.length >= 20);
});
