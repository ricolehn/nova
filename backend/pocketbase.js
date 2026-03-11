const crypto = require('crypto');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const DEFAULT_SETTINGS = {
  vollverdiener: 50,
  geringverdiener: 25,
  keinverdiener: 10,
  pausiert: 0,
  reportStartDate: null
};

const DEFAULT_SYSTEM_STATE = {
  inviteCode: '123456',
  superAdminUid: null
};

const DEFAULT_COLLECTION_SPECS = [
  {
    name: 'people',
    type: 'base',
    listRule: '@request.auth.admin = true || uid = @request.auth.id',
    viewRule: '@request.auth.admin = true || uid = @request.auth.id',
    createRule: '@request.auth.admin = true',
    updateRule: '@request.auth.admin = true',
    deleteRule: '@request.auth.admin = true',
    indexes: [
      'CREATE UNIQUE INDEX idx_people_person_key ON people (personKey)',
      'CREATE INDEX idx_people_uid ON people (uid)',
      'CREATE INDEX idx_people_name ON people (name)'
    ],
    fields: [
      { name: 'personKey', type: 'text', required: true },
      { name: 'uid', type: 'text' },
      { name: 'name', type: 'text', required: true },
      { name: 'data', type: 'json', required: true }
    ]
  },
  {
    name: 'requests',
    type: 'base',
    listRule: '@request.auth.admin = true || userId = @request.auth.id',
    viewRule: '@request.auth.admin = true || userId = @request.auth.id',
    createRule: '@request.auth.admin = true || userId = @request.auth.id',
    updateRule: '@request.auth.admin = true || userId = @request.auth.id',
    deleteRule: '@request.auth.admin = true',
    indexes: [
      'CREATE UNIQUE INDEX idx_requests_request_key ON requests (requestKey)',
      'CREATE INDEX idx_requests_user_id ON requests (userId)',
      'CREATE INDEX idx_requests_status ON requests (status)'
    ],
    fields: [
      { name: 'requestKey', type: 'text', required: true },
      { name: 'userId', type: 'text', required: true },
      { name: 'personId', type: 'text' },
      { name: 'personName', type: 'text' },
      { name: 'type', type: 'text' },
      { name: 'status', type: 'text' },
      { name: 'timestamp', type: 'number' },
      { name: 'data', type: 'json', required: true }
    ]
  },
  {
    name: 'app_state',
    type: 'base',
    listRule: '@request.auth.admin = true',
    viewRule: '@request.auth.admin = true',
    createRule: '@request.auth.admin = true',
    updateRule: '@request.auth.admin = true',
    deleteRule: '@request.auth.superAdmin = true',
    indexes: [
      'CREATE UNIQUE INDEX idx_app_state_key ON app_state (key)'
    ],
    fields: [
      { name: 'key', type: 'text', required: true },
      { name: 'value', type: 'json' }
    ]
  }
];

function getPocketBaseBaseUrl() {
  return process.env.POCKETBASE_BASE_URL || `http://127.0.0.1:${process.env.POCKETBASE_PORT || '8090'}`;
}

function getPocketBaseBinaryPath() {
  return process.env.POCKETBASE_BIN || path.join(__dirname, '..', 'pocketbase');
}

function getPocketBaseDataDir() {
  return process.env.POCKETBASE_DIR || path.join(process.env.DATA_DIR || '/app/data', 'pocketbase');
}

function generatePocketBaseCredentials() {
  return {
    url: getPocketBaseBaseUrl(),
    // Internal-only superuser used by the bundled backend to provision PocketBase.
    adminEmail: `nova-${crypto.randomUUID()}@local.invalid`,
    adminPassword: crypto.randomBytes(24).toString('base64url')
  };
}

function normalizeDataPath(input = '') {
  return String(input || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');
}

function decodeTokenPayload(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Missing token');
  }

  const parts = token.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid token');
  }

  const payload = parts[1];
  const padded = payload + '='.repeat((4 - (payload.length % 4 || 4)) % 4);
  try {
    return JSON.parse(Buffer.from(padded, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid token payload');
  }
}

function toPublicUser(record) {
  if (!record) return null;
  return {
    uid: record.id,
    id: record.id,
    email: record.email || '',
    firstName: record.firstName || '',
    lastName: record.lastName || '',
    name: record.name || `${record.firstName || ''} ${record.lastName || ''}`.trim(),
    admin: record.admin === true,
    superAdmin: record.superAdmin === true,
    emailNotifications: record.emailNotifications !== false
  };
}

function sanitizeSelfUserWrite(input = {}) {
  const output = {};
  if (typeof input.firstName === 'string') output.firstName = input.firstName.trim();
  if (typeof input.lastName === 'string') output.lastName = input.lastName.trim();
  if (typeof input.emailNotifications === 'boolean') output.emailNotifications = input.emailNotifications;
  if (output.firstName || output.lastName) {
    output.name = `${output.firstName || ''} ${output.lastName || ''}`.trim();
  }
  return output;
}

function buildPocketBaseError(response, fallback) {
  const error = new Error(response?.message || fallback || 'PocketBase request failed');
  error.status = response?.status || 500;
  error.response = response || null;
  return error;
}

async function pocketBaseRequest(path, options = {}) {
  const {
    method = 'GET',
    token,
    body,
    allow404 = false,
    headers = {}
  } = options;

  const requestHeaders = { ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (body !== undefined && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${getPocketBaseBaseUrl()}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  const payload = text ? (() => {
    try {
      return JSON.parse(text);
    } catch {
      return { message: text, status: response.status };
    }
  })() : null;

  if (!response.ok) {
    if (allow404 && response.status === 404) return null;
    throw buildPocketBaseError(payload, `PocketBase ${method} ${path} failed`);
  }

  return payload;
}

async function authenticateSuperuser(appConfig) {
  if (!appConfig?.pocketbase?.adminEmail || !appConfig?.pocketbase?.adminPassword) {
    throw new Error('PocketBase superuser credentials are missing.');
  }

  const auth = await pocketBaseRequest('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: {
      identity: appConfig.pocketbase.adminEmail,
      password: appConfig.pocketbase.adminPassword
    }
  });

  return auth.token;
}

async function ensurePocketBaseSuperuser(appConfig) {
  if (!appConfig?.pocketbase?.adminEmail || !appConfig?.pocketbase?.adminPassword) {
    throw new Error('PocketBase superuser credentials are missing.');
  }

  await execFileAsync(getPocketBaseBinaryPath(), [
    '--dir',
    getPocketBaseDataDir(),
    'superuser',
    'upsert',
    appConfig.pocketbase.adminEmail,
    appConfig.pocketbase.adminPassword
  ]);
}

async function ensureUsersCollection(appConfig) {
  const token = await authenticateSuperuser(appConfig);
  const existing = await pocketBaseRequest('/api/collections/users', { token });
  const fields = [...existing.fields];
  const wantedFields = [
    { name: 'firstName', type: 'text' },
    { name: 'lastName', type: 'text' },
    { name: 'admin', type: 'bool' },
    { name: 'superAdmin', type: 'bool' },
    { name: 'emailNotifications', type: 'bool' }
  ];

  for (const field of wantedFields) {
    if (!fields.some((existingField) => existingField.name === field.name)) {
      fields.push(field);
    }
  }

  await pocketBaseRequest('/api/collections/users', {
    method: 'PATCH',
    token,
    body: {
      ...existing,
      listRule: '@request.auth.admin = true',
      viewRule: 'id = @request.auth.id || @request.auth.admin = true',
      createRule: '',
      updateRule: 'id = @request.auth.id || @request.auth.admin = true',
      deleteRule: '@request.auth.superAdmin = true',
      fields,
      indexes: existing.indexes || []
    }
  });
}

function mergeCollectionSpec(existing, spec) {
  const mergedFields = [...(existing.fields || [])];
  for (const field of spec.fields || []) {
    if (!mergedFields.some((existingField) => existingField.name === field.name)) {
      mergedFields.push(field);
    }
  }

  return {
    ...existing,
    ...spec,
    fields: mergedFields,
    indexes: spec.indexes || existing.indexes || []
  };
}

async function ensureCollection(appConfig, spec) {
  const token = await authenticateSuperuser(appConfig);
  const existing = await pocketBaseRequest(`/api/collections/${spec.name}`, {
    token,
    allow404: true
  });

  if (!existing) {
    await pocketBaseRequest('/api/collections', {
      method: 'POST',
      token,
      body: spec
    });
    return;
  }

  await pocketBaseRequest(`/api/collections/${spec.name}`, {
    method: 'PATCH',
    token,
    body: mergeCollectionSpec(existing, spec)
  });
}

async function listAllRecords(collectionName, filter, appConfig) {
  const token = await authenticateSuperuser(appConfig);
  const items = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    if (filter) params.set('filter', filter);
    const result = await pocketBaseRequest(`/api/collections/${collectionName}/records?${params.toString()}`, { token });
    items.push(...(result.items || []));
    if (page >= (result.totalPages || 1)) break;
    page += 1;
  }

  return items;
}

function pbFilterEquals(field, value) {
  return `${field} = ${JSON.stringify(String(value))}`;
}

async function getFirstRecord(collectionName, filter, appConfig) {
  const token = await authenticateSuperuser(appConfig);
  const params = new URLSearchParams({ page: '1', perPage: '1', filter });
  const result = await pocketBaseRequest(`/api/collections/${collectionName}/records?${params.toString()}`, { token });
  return result.items?.[0] || null;
}

async function createRecord(collectionName, body, appConfig) {
  const token = await authenticateSuperuser(appConfig);
  return pocketBaseRequest(`/api/collections/${collectionName}/records`, {
    method: 'POST',
    token,
    body
  });
}

async function updateRecord(collectionName, recordId, body, appConfig) {
  const token = await authenticateSuperuser(appConfig);
  return pocketBaseRequest(`/api/collections/${collectionName}/records/${recordId}`, {
    method: 'PATCH',
    token,
    body
  });
}

async function deleteRecord(collectionName, recordId, appConfig) {
  const token = await authenticateSuperuser(appConfig);
  return pocketBaseRequest(`/api/collections/${collectionName}/records/${recordId}`, {
    method: 'DELETE',
    token
  });
}

async function upsertStateValue(appConfig, key, value) {
  const existing = await getFirstRecord('app_state', pbFilterEquals('key', key), appConfig);
  if (existing) {
    return updateRecord('app_state', existing.id, { key, value }, appConfig);
  }
  return createRecord('app_state', { key, value }, appConfig);
}

async function getStateRecord(appConfig, key) {
  return getFirstRecord('app_state', pbFilterEquals('key', key), appConfig);
}

async function getStateValue(appConfig, key, fallback = null) {
  const record = await getStateRecord(appConfig, key);
  return record ? record.value : fallback;
}

async function ensureStateDefaults(appConfig) {
  const defaults = new Map([
    ['settings', DEFAULT_SETTINGS],
    ['donations', {}],
    ['expenses', {}],
    ['system', DEFAULT_SYSTEM_STATE]
  ]);

  for (const [key, value] of defaults.entries()) {
    const existing = await getStateRecord(appConfig, key);
    if (!existing) {
      await createRecord('app_state', { key, value }, appConfig);
    }
  }
}

async function ensurePocketBaseSchema(appConfig) {
  await ensureUsersCollection(appConfig);
  for (const spec of DEFAULT_COLLECTION_SPECS) {
    await ensureCollection(appConfig, spec);
  }
  await ensureStateDefaults(appConfig);
}

async function verifyUserToken(token) {
  const payload = decodeTokenPayload(token);
  if (!payload?.id) {
    throw new Error('Invalid token payload');
  }

  const userRecord = await pocketBaseRequest(`/api/collections/users/records/${payload.id}`, {
    token
  });

  return toPublicUser(userRecord);
}

async function registerUser({ email, password }) {
  const created = await pocketBaseRequest('/api/collections/users/records', {
    method: 'POST',
    body: {
      email,
      password,
      passwordConfirm: password,
      emailVisibility: false,
      admin: false,
      superAdmin: false,
      emailNotifications: true
    }
  });

  const auth = await pocketBaseRequest('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: {
      identity: email,
      password
    }
  });

  return {
    created,
    token: auth.token,
    user: toPublicUser(auth.record)
  };
}

async function loginUser(email, password) {
  const auth = await pocketBaseRequest('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: {
      identity: email,
      password
    }
  });

  return {
    token: auth.token,
    user: toPublicUser(auth.record)
  };
}

async function updateOwnPassword(token, userId, password) {
  await pocketBaseRequest(`/api/collections/users/records/${userId}`, {
    method: 'PATCH',
    token,
    body: {
      password,
      passwordConfirm: password
    }
  });
}

async function getUserRecord(appConfig, uid) {
  const token = await authenticateSuperuser(appConfig);
  return pocketBaseRequest(`/api/collections/users/records/${uid}`, {
    token,
    allow404: true
  });
}

async function listUserRecords(appConfig) {
  return listAllRecords('users', '', appConfig);
}

async function updateUserRecord(appConfig, uid, body) {
  return updateRecord('users', uid, body, appConfig);
}

function buildPersonRecordPayload(personKey, value) {
  return {
    personKey: String(personKey),
    uid: value?.uid ? String(value.uid) : '',
    name: value?.name ? String(value.name) : '',
    data: value || null
  };
}

function buildRequestRecordPayload(requestKey, value) {
  return {
    requestKey: String(requestKey),
    userId: value?.userId ? String(value.userId) : '',
    personId: value?.personId ? String(value.personId) : '',
    personName: value?.personName ? String(value.personName) : '',
    type: value?.type ? String(value.type) : '',
    status: value?.status ? String(value.status) : '',
    timestamp: typeof value?.timestamp === 'number' ? value.timestamp : null,
    data: value || null
  };
}

async function getPeopleRecord(appConfig, personKey) {
  return getFirstRecord('people', pbFilterEquals('personKey', personKey), appConfig);
}

async function listPeopleRecords(appConfig, query = {}) {
  let filter = '';
  if (query.orderByChild === 'uid' && query.equalTo !== undefined) {
    filter = pbFilterEquals('uid', query.equalTo);
  } else if (query.orderByChild === 'name' && query.equalTo !== undefined) {
    filter = pbFilterEquals('name', query.equalTo);
  }
  return listAllRecords('people', filter, appConfig);
}

async function upsertPeopleRecord(appConfig, personKey, value, expectedUpdated = null) {
  const existing = await getPeopleRecord(appConfig, personKey);
  if (existing) {
    if (expectedUpdated && existing.updated !== expectedUpdated) {
      const error = new Error('Conflict');
      error.status = 409;
      throw error;
    }
    return updateRecord('people', existing.id, buildPersonRecordPayload(personKey, value), appConfig);
  }
  if (expectedUpdated) {
    const error = new Error('Conflict');
    error.status = 409;
    throw error;
  }
  return createRecord('people', buildPersonRecordPayload(personKey, value), appConfig);
}

async function removePeopleRecord(appConfig, personKey) {
  const existing = await getPeopleRecord(appConfig, personKey);
  if (existing) {
    await deleteRecord('people', existing.id, appConfig);
  }
}

async function getRequestRecord(appConfig, requestKey) {
  return getFirstRecord('requests', pbFilterEquals('requestKey', requestKey), appConfig);
}

async function listRequestRecords(appConfig, query = {}) {
  let filter = '';
  if (query.orderByChild === 'userId' && query.equalTo !== undefined) {
    filter = pbFilterEquals('userId', query.equalTo);
  }
  return listAllRecords('requests', filter, appConfig);
}

async function upsertRequestRecord(appConfig, requestKey, value) {
  const existing = await getRequestRecord(appConfig, requestKey);
  if (existing) {
    return updateRecord('requests', existing.id, buildRequestRecordPayload(requestKey, value), appConfig);
  }
  return createRecord('requests', buildRequestRecordPayload(requestKey, value), appConfig);
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_SYSTEM_STATE,
  generatePocketBaseCredentials,
  normalizeDataPath,
  decodeTokenPayload,
  toPublicUser,
  sanitizeSelfUserWrite,
  getPocketBaseBaseUrl,
  getPocketBaseBinaryPath,
  getPocketBaseDataDir,
  ensurePocketBaseSuperuser,
  ensurePocketBaseSchema,
  verifyUserToken,
  registerUser,
  loginUser,
  updateOwnPassword,
  getStateValue,
  upsertStateValue,
  getStateRecord,
  getUserRecord,
  listUserRecords,
  updateUserRecord,
  listPeopleRecords,
  getPeopleRecord,
  upsertPeopleRecord,
  removePeopleRecord,
  listRequestRecords,
  getRequestRecord,
  upsertRequestRecord
};
