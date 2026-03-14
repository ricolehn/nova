const { performance } = require('perf_hooks');

// Stub DB operations with a 10ms delay
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getStateRecord(appConfig, key) {
  await sleep(10);
  // Simulating not found, so it creates
  return null;
}

async function createRecord(collection, payload, appConfig) {
  await sleep(10);
  return { id: 'test_id', ...payload };
}

const DEFAULT_SETTINGS = {};
const DEFAULT_SYSTEM_STATE = {};

async function runSequential() {
  const defaults = new Map([
    ['settings', DEFAULT_SETTINGS],
    ['donations', {}],
    ['expenses', {}],
    ['system', DEFAULT_SYSTEM_STATE]
  ]);

  for (const [key, value] of defaults.entries()) {
    const existing = await getStateRecord(null, key);
    if (!existing) {
      await createRecord('app_state', { key, value }, null);
    }
  }
}

async function runConcurrent() {
  const defaults = new Map([
    ['settings', DEFAULT_SETTINGS],
    ['donations', {}],
    ['expenses', {}],
    ['system', DEFAULT_SYSTEM_STATE]
  ]);

  const promises = Array.from(defaults.entries()).map(async ([key, value]) => {
    const existing = await getStateRecord(null, key);
    if (!existing) {
      await createRecord('app_state', { key, value }, null);
    }
  });

  await Promise.all(promises);
}

async function main() {
  const startSeq = performance.now();
  await runSequential();
  const seqTime = performance.now() - startSeq;
  console.log(`Sequential Time: ${seqTime.toFixed(2)}ms`);

  const startConc = performance.now();
  await runConcurrent();
  const concTime = performance.now() - startConc;
  console.log(`Concurrent Time: ${concTime.toFixed(2)}ms`);
}

main();
