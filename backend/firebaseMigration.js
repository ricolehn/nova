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

  // Recurse to handle arbitrary depth (like a project ID wrapper)
  const unwrapped = unwrapFirebaseExportRoot(nested);
  if (unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
    if (Object.keys(unwrapped).some((key) => EXPECTED_MIGRATION_KEYS.has(key))) {
      return unwrapped;
    }
  }

  return data;
}

module.exports = {
  EXPECTED_MIGRATION_KEYS,
  unwrapFirebaseExportRoot
};
