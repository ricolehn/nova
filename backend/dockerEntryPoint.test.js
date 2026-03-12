const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const entrypoint = path.join(repoRoot, 'docker-entrypoint.sh');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'docker-entrypoint-'));
}

function formatFailure(result) {
  return `exit=${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
}

test('docker entrypoint populates an empty frontend directory from the seed copy', () => {
  const tempRoot = makeTempDir();
  try {
    const dataDir = path.join(tempRoot, 'data');
    const frontendDir = path.join(tempRoot, 'html');
    const seedDir = path.join(tempRoot, 'html-seed');

    fs.mkdirSync(seedDir, { recursive: true });
    fs.writeFileSync(path.join(seedDir, 'index.html'), '<!doctype html>');
    fs.mkdirSync(path.join(seedDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(seedDir, 'assets', 'style.css'), 'body {}');

    const result = spawnSync(entrypoint, ['/bin/sh', '-c', 'exit 0'], {
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        FRONTEND_DIR: frontendDir,
        FRONTEND_SEED_DIR: seedDir
      },
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, formatFailure(result));
    assert.equal(fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8'), '<!doctype html>');
    assert.equal(fs.readFileSync(path.join(frontendDir, 'assets', 'style.css'), 'utf8'), 'body {}');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('docker entrypoint preserves an existing frontend directory', () => {
  const tempRoot = makeTempDir();
  try {
    const dataDir = path.join(tempRoot, 'data');
    const frontendDir = path.join(tempRoot, 'html');
    const seedDir = path.join(tempRoot, 'html-seed');

    fs.mkdirSync(frontendDir, { recursive: true });
    fs.writeFileSync(path.join(frontendDir, 'index.html'), 'custom frontend');
    fs.mkdirSync(seedDir, { recursive: true });
    fs.writeFileSync(path.join(seedDir, 'index.html'), 'seed frontend');

    const result = spawnSync(entrypoint, ['/bin/sh', '-c', 'exit 0'], {
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        FRONTEND_DIR: frontendDir,
        FRONTEND_SEED_DIR: seedDir
      },
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, formatFailure(result));
    // The entrypoint now always syncs seed files so upgrades take effect
    assert.equal(fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8'), 'seed frontend');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('docker entrypoint updates stale frontend files on image upgrade', () => {
  const tempRoot = makeTempDir();
  try {
    const dataDir = path.join(tempRoot, 'data');
    const frontendDir = path.join(tempRoot, 'html');
    const seedDir = path.join(tempRoot, 'html-seed');

    // Simulate an existing volume from a previous image version
    fs.mkdirSync(path.join(frontendDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(frontendDir, 'index.html'), 'old version');
    fs.writeFileSync(path.join(frontendDir, 'assets', 'app.js'), 'old app code');

    // Simulate a new image with updated seed files
    fs.mkdirSync(path.join(seedDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(seedDir, 'index.html'), 'new version');
    fs.writeFileSync(path.join(seedDir, 'assets', 'app.js'), 'new app code');
    fs.writeFileSync(path.join(seedDir, 'assets', 'new-file.css'), 'added in upgrade');

    const result = spawnSync(entrypoint, ['/bin/sh', '-c', 'exit 0'], {
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        FRONTEND_DIR: frontendDir,
        FRONTEND_SEED_DIR: seedDir
      },
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, formatFailure(result));
    // Existing files should be overwritten with seed content
    assert.equal(fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8'), 'new version');
    assert.equal(fs.readFileSync(path.join(frontendDir, 'assets', 'app.js'), 'utf8'), 'new app code');
    // New files from seed should appear in the frontend directory
    assert.equal(fs.readFileSync(path.join(frontendDir, 'assets', 'new-file.css'), 'utf8'), 'added in upgrade');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
