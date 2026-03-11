const test = require('node:test');
const assert = require('node:assert/strict');
const { unwrapFirebaseExportRoot } = require('./firebaseMigration');

test('unwrapFirebaseExportRoot unwraps single Firebase export wrapper node', () => {
  const wrapped = {
    'juba-kasse-default-rtdb-europe-west1': {
      expenses: [{ id: '1', amount: 10 }],
      people: {
        '1753650720871': {
          id: '1753650720871',
          name: 'Denis Chaban'
        }
      }
    }
  };

  assert.deepEqual(unwrapFirebaseExportRoot(wrapped), wrapped['juba-kasse-default-rtdb-europe-west1']);
});

test('unwrapFirebaseExportRoot leaves already-flat migration payloads unchanged', () => {
  const flat = {
    expenses: [{ id: '1', amount: 10 }],
    people: {
      '1753650720871': {
        id: '1753650720871',
        name: 'Denis Chaban'
      }
    }
  };

  assert.deepEqual(unwrapFirebaseExportRoot(flat), flat);
});

test('unwrapFirebaseExportRoot ignores unrelated single-key objects', () => {
  const unrelated = {
    metadata: {
      version: 1
    }
  };

  assert.deepEqual(unwrapFirebaseExportRoot(unrelated), unrelated);
});
