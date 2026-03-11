const EXPECTED_MIGRATION_KEYS = new Set([
  'settings',
  'system',
  'donations',
  'expenses',
  'people',
  'requests',
  'users'
]);

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

  return data;
}

module.exports = {
  EXPECTED_MIGRATION_KEYS,
  unwrapFirebaseExportRoot
};
