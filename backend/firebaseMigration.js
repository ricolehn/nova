const crypto = require('crypto');
const admin = require('firebase-admin');

const REQUIRED_FIREBASE_CONFIG_FIELDS = [
  'apiKey',
  'authDomain',
  'databaseURL',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId'
];

const REQUIRED_SERVICE_ACCOUNT_FIELDS = [
  'project_id',
  'private_key',
  'client_email'
];

const EXPECTED_MIGRATION_KEYS = new Set([
  'settings',
  'system',
  'donations',
  'expenses',
  'people',
  'requests',
  'users'
]);

function createValidationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function parseJsonObject(rawValue, label) {
  const input = String(rawValue || '').trim();
  if (!input) {
    throw createValidationError(`${label} fehlt.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    throw createValidationError(`${label} ist kein gültiges JSON.`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createValidationError(`${label} muss ein JSON-Objekt sein.`);
  }

  return parsed;
}

function extractFirebaseConfigObjectLiteral(value) {
  const assignmentPattern = /^(?:const|let|var)?\s*firebaseConfig\s*=/;
  if (!assignmentPattern.test(value)) {
    return value;
  }

  const start = value.indexOf('{');
  if (start === -1) {
    throw createValidationError('Firebase-Konfiguration enthält kein Objekt.');
  }

  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = start; index < value.length; index++) {
    const char = value[index];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  throw createValidationError('Firebase-Konfiguration enthält ein unvollständiges Objekt.');
}

function parseFirebaseConfigInput(rawValue) {
  const input = String(rawValue || '').trim();
  if (!input) {
    throw createValidationError('Firebase-Konfiguration fehlt.');
  }

  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch {
    const objectLiteral = extractFirebaseConfigObjectLiteral(input);
    const extractedConfig = {};
    const firebaseFieldRegex = /(apiKey|authDomain|databaseURL|projectId|storageBucket|messagingSenderId|appId)\s*:\s*(['"`])(.*?)\2/g;
    let match;

    while ((match = firebaseFieldRegex.exec(objectLiteral)) !== null) {
      extractedConfig[match[1]] = match[3];
    }

    if (Object.keys(extractedConfig).length === 0) {
      throw createValidationError('Firebase-Konfiguration ist kein gültiges JSON oder firebaseConfig-Snippet.');
    }

    parsed = extractedConfig;
  }

  if (parsed?.firebaseConfig && typeof parsed.firebaseConfig === 'object' && !Array.isArray(parsed.firebaseConfig)) {
    parsed = parsed.firebaseConfig;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createValidationError('Firebase-Konfiguration muss ein Objekt sein.');
  }

  const missingFields = REQUIRED_FIREBASE_CONFIG_FIELDS.filter((field) => typeof parsed[field] !== 'string' || !parsed[field].trim());
  if (missingFields.length > 0) {
    throw createValidationError(`Firebase-Konfiguration fehlt: ${missingFields.join(', ')}`);
  }

  return Object.fromEntries(REQUIRED_FIREBASE_CONFIG_FIELDS.map((field) => [field, parsed[field].trim()]));
}

function parseServiceAccountInput(rawValue) {
  let parsed = parseJsonObject(rawValue, 'Service-Account');

  if (parsed?.serviceAccount && typeof parsed.serviceAccount === 'object' && !Array.isArray(parsed.serviceAccount)) {
    parsed = parsed.serviceAccount;
  }

  const missingFields = REQUIRED_SERVICE_ACCOUNT_FIELDS.filter((field) => typeof parsed[field] !== 'string' || !parsed[field].trim());
  if (missingFields.length > 0) {
    throw createValidationError(`Service-Account fehlt: ${missingFields.join(', ')}`);
  }

  return parsed;
}

function parseLegacyConfigInput(rawValue) {
  const input = String(rawValue || '').trim();
  if (!input) return null;

  const parsed = parseJsonObject(input, 'Alte config.json');
  const resolved = {};

  if (parsed.firebaseConfig) {
    resolved.firebaseConfig = parseFirebaseConfigInput(JSON.stringify(parsed.firebaseConfig));
  } else if (REQUIRED_FIREBASE_CONFIG_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(parsed, field))) {
    resolved.firebaseConfig = parseFirebaseConfigInput(JSON.stringify(parsed));
  }

  if (parsed.serviceAccount) {
    resolved.serviceAccount = parseServiceAccountInput(JSON.stringify(parsed.serviceAccount));
  } else if (REQUIRED_SERVICE_ACCOUNT_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(parsed, field))) {
    resolved.serviceAccount = parseServiceAccountInput(JSON.stringify(parsed));
  }

  if (!resolved.firebaseConfig && !resolved.serviceAccount) {
    throw createValidationError('Alte config.json enthält weder firebaseConfig noch serviceAccount.');
  }

  return resolved;
}

function resolveFirebaseMigrationCredentials(input = {}) {
  const legacyConfig = parseLegacyConfigInput(input.legacyConfig);
  const firebaseConfig = legacyConfig?.firebaseConfig || parseFirebaseConfigInput(input.firebaseConfig);
  const serviceAccount = legacyConfig?.serviceAccount || parseServiceAccountInput(input.serviceAccount);
  return { firebaseConfig, serviceAccount };
}

function unwrapFirebaseExportRoot(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }

  const rootKeys = Object.keys(data);
  if (rootKeys.length !== 1) {
    return data;
  }

  const [rootKey] = rootKeys;
  if (EXPECTED_MIGRATION_KEYS.has(rootKey)) {
    return data;
  }

  const nested = data[rootKey];
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
    return data;
  }

  const nestedKeys = Object.keys(nested);
  if (nestedKeys.some((key) => EXPECTED_MIGRATION_KEYS.has(key))) {
    return nested;
  }

  const unwrapped = unwrapFirebaseExportRoot(nested);
  if (
    unwrapped &&
    typeof unwrapped === 'object' &&
    !Array.isArray(unwrapped) &&
    Object.keys(unwrapped).some((key) => EXPECTED_MIGRATION_KEYS.has(key))
  ) {
    return unwrapped;
  }

  return data;
}

async function fetchFirebaseMigrationData({ firebaseConfig, serviceAccount }) {
  const appName = `firebase-migration-${crypto.randomUUID()}`;
  const firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: firebaseConfig.databaseURL
  }, appName);

  try {
    const snapshot = await admin.database(firebaseApp).ref('/').get();
    return unwrapFirebaseExportRoot(snapshot.val() || {});
  } catch (error) {
    const details = [error.code, error.name, error.message].filter(Boolean).join(' | ');
    const wrappedError = new Error(`Firebase-Daten konnten nicht gelesen werden: ${details || 'Unbekannter Firebase-Fehler'}`);
    wrappedError.status = 502;
    throw wrappedError;
  } finally {
    await firebaseApp.delete().catch(() => {});
  }
}

function countEntries(value) {
  if (!value || typeof value !== 'object') return 0;
  return Array.isArray(value) ? value.filter((entry) => entry !== undefined && entry !== null).length : Object.keys(value).length;
}

function getRecordEntries(value) {
  if (!value || typeof value !== 'object') return [];

  if (Array.isArray(value)) {
    return value
      .map((entry, index) => [entry?.id ? String(entry.id) : String(index), entry])
      .filter(([, entry]) => entry && typeof entry === 'object');
  }

  return Object.entries(value).filter(([, entry]) => entry && typeof entry === 'object');
}

async function migrateFirebaseData(options = {}) {
  const {
    appConfig,
    data,
    upsertStateValue,
    upsertPeopleRecord,
    upsertRequestRecord,
    syncExpenseRecords,
    getUserRecord,
    updateUserRecord
  } = options;

  const payload = unwrapFirebaseExportRoot(data);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createValidationError('Firebase-Migrationsdaten müssen ein Objekt am Datenbank-Root enthalten.');
  }

  const summary = {
    settingsMigrated: false,
    systemMigrated: false,
    donationsMigrated: false,
    peopleMigrated: 0,
    requestsMigrated: 0,
    expensesMigrated: countEntries(payload.expenses),
    usersUpdated: 0,
    usersSkipped: 0
  };

  if (payload.settings && typeof payload.settings === 'object' && !Array.isArray(payload.settings)) {
    await upsertStateValue(appConfig, 'settings', payload.settings);
    summary.settingsMigrated = true;
  }

  if (payload.system && typeof payload.system === 'object' && !Array.isArray(payload.system)) {
    await upsertStateValue(appConfig, 'system', payload.system);
    summary.systemMigrated = true;
  }

  if (payload.donations && typeof payload.donations === 'object') {
    await upsertStateValue(appConfig, 'donations', payload.donations);
    summary.donationsMigrated = true;
  }

  if (payload.expenses && typeof payload.expenses === 'object') {
    await syncExpenseRecords(appConfig, payload.expenses);
  }

  for (const [personKey, personData] of getRecordEntries(payload.people)) {
    await upsertPeopleRecord(appConfig, personKey, personData);
    summary.peopleMigrated++;
  }

  for (const [requestKey, requestData] of getRecordEntries(payload.requests)) {
    await upsertRequestRecord(appConfig, requestKey, requestData);
    summary.requestsMigrated++;
  }

  for (const [uid, userData] of getRecordEntries(payload.users)) {
    const existingUser = await getUserRecord(appConfig, uid);
    if (!existingUser) {
      summary.usersSkipped++;
      continue;
    }

    await updateUserRecord(appConfig, uid, userData);
    summary.usersUpdated++;
  }

  return summary;
}

module.exports = {
  REQUIRED_FIREBASE_CONFIG_FIELDS,
  REQUIRED_SERVICE_ACCOUNT_FIELDS,
  EXPECTED_MIGRATION_KEYS,
  parseFirebaseConfigInput,
  parseServiceAccountInput,
  resolveFirebaseMigrationCredentials,
  unwrapFirebaseExportRoot,
  fetchFirebaseMigrationData,
  migrateFirebaseData,
  countEntries
};
