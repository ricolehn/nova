const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseFirebaseConfigInput,
  parseServiceAccountInput,
  resolveFirebaseMigrationCredentials,
  unwrapFirebaseExportRoot,
  migrateFirebaseData
} = require('./firebaseMigration');

test('parseFirebaseConfigInput accepts a firebaseConfig snippet', () => {
  const parsed = parseFirebaseConfigInput(`
    const firebaseConfig = {
      apiKey: "api-key",
      authDomain: "example.firebaseapp.com",
      databaseURL: "https://example-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "example",
      storageBucket: "example.firebasestorage.app",
      messagingSenderId: "1234567890",
      appId: "1:1234567890:web:abcdef"
    };
  `);

  assert.deepEqual(parsed, {
    apiKey: 'api-key',
    authDomain: 'example.firebaseapp.com',
    databaseURL: 'https://example-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'example',
    storageBucket: 'example.firebasestorage.app',
    messagingSenderId: '1234567890',
    appId: '1:1234567890:web:abcdef'
  });
});

test('resolveFirebaseMigrationCredentials extracts firebaseConfig and serviceAccount from legacy config.json', () => {
  const resolved = resolveFirebaseMigrationCredentials({
    legacyConfig: JSON.stringify({
      appName: 'Nova',
      firebaseConfig: {
        apiKey: 'api-key',
        authDomain: 'example.firebaseapp.com',
        databaseURL: 'https://example-default-rtdb.europe-west1.firebasedatabase.app',
        projectId: 'example',
        storageBucket: 'example.firebasestorage.app',
        messagingSenderId: '1234567890',
        appId: '1:1234567890:web:abcdef'
      },
      serviceAccount: {
        project_id: 'example',
        private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
        client_email: 'firebase-adminsdk@example.iam.gserviceaccount.com'
      }
    })
  });

  assert.equal(resolved.firebaseConfig.projectId, 'example');
  assert.equal(resolved.serviceAccount.project_id, 'example');
  assert.equal(resolved.serviceAccount.client_email, 'firebase-adminsdk@example.iam.gserviceaccount.com');
});

test('parseServiceAccountInput accepts raw service account JSON', () => {
  const parsed = parseServiceAccountInput(JSON.stringify({
    type: 'service_account',
    project_id: 'example',
    private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
    client_email: 'firebase-adminsdk@example.iam.gserviceaccount.com'
  }));

  assert.equal(parsed.project_id, 'example');
  assert.equal(parsed.client_email, 'firebase-adminsdk@example.iam.gserviceaccount.com');
});

test('unwrapFirebaseExportRoot unwraps doubly nested Firebase export wrapper nodes', () => {
  const doublyWrapped = {
    'juba-kasse-default-rtdb': {
      'project-123': {
        expenses: [{ id: '1', amount: 10 }],
        people: {
          '1753650720871': {
            id: '1753650720871',
            name: 'Denis Chaban'
          }
        }
      }
    }
  };

  assert.deepEqual(unwrapFirebaseExportRoot(doublyWrapped), doublyWrapped['juba-kasse-default-rtdb']['project-123']);
});

test('migrateFirebaseData migrates legacy root nodes into the current PocketBase callbacks', async () => {
  const recorded = {
    states: [],
    people: [],
    requests: [],
    expenses: [],
    userUpdates: []
  };

  const summary = await migrateFirebaseData({
    appConfig: { appName: 'Nova' },
    data: {
      settings: { vollverdiener: 50 },
      system: { inviteCode: '123456' },
      donations: { donation1: { amount: 5 } },
      expenses: { expense1: { id: 'expense1', amount: 7 } },
      people: { person1: { id: 'person1', name: 'Ada' } },
      requests: { request1: { id: 'request1', userId: 'user1' } },
      users: {
        user1: { admin: true },
        user2: { admin: false }
      }
    },
    upsertStateValue: async (appConfig, key, value) => {
      recorded.states.push({ appConfig, key, value });
    },
    upsertPeopleRecord: async (appConfig, key, value) => {
      recorded.people.push({ appConfig, key, value });
    },
    upsertRequestRecord: async (appConfig, key, value) => {
      recorded.requests.push({ appConfig, key, value });
    },
    syncExpenseRecords: async (appConfig, value) => {
      recorded.expenses.push({ appConfig, value });
    },
    getUserRecord: async (appConfig, uid) => (uid === 'user1' ? { id: uid } : null),
    updateUserRecord: async (appConfig, uid, value) => {
      recorded.userUpdates.push({ appConfig, uid, value });
    }
  });

  assert.deepEqual(recorded.states.map((entry) => entry.key), ['settings', 'system', 'donations']);
  assert.equal(recorded.people.length, 1);
  assert.equal(recorded.requests.length, 1);
  assert.equal(recorded.expenses.length, 1);
  assert.deepEqual(recorded.userUpdates, [{
    appConfig: { appName: 'Nova' },
    uid: 'user1',
    value: { admin: true }
  }]);

  assert.deepEqual(summary, {
    settingsMigrated: true,
    systemMigrated: true,
    donationsMigrated: true,
    peopleMigrated: 1,
    requestsMigrated: 1,
    expensesMigrated: 1,
    usersUpdated: 1,
    usersSkipped: 1
  });
});
