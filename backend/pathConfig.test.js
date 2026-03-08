const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { resolveDataDirectory, resolveFrontendDirectory } = require('./pathConfig');

test('resolveDataDirectory defaults to the persistent /app/data-compatible path', () => {
  assert.equal(resolveDataDirectory({ env: {} }), path.join(__dirname, '..', 'data'));
});

test('resolveDataDirectory honors DATA_DIR overrides', () => {
  assert.equal(resolveDataDirectory({ env: { DATA_DIR: '/tmp/nova-data' } }), '/tmp/nova-data');
});

test('resolveFrontendDirectory prefers FRONTEND_DIR overrides', () => {
  assert.equal(resolveFrontendDirectory({
    env: { FRONTEND_DIR: '/tmp/nova-html' }
  }), '/tmp/nova-html');
});

test('resolveFrontendDirectory uses bundled /app/html when available', () => {
  assert.equal(resolveFrontendDirectory({
    env: {},
    existsSync: (candidate) => candidate === path.join(__dirname, '..', 'html')
  }), path.join(__dirname, '..', 'html'));
});

test('resolveFrontendDirectory falls back to the repository root for local development', () => {
  assert.equal(resolveFrontendDirectory({
    env: {},
    existsSync: () => false
  }), path.join(__dirname, '..'));
});
