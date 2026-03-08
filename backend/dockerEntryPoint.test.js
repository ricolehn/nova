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
    assert.equal(fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8'), 'custom frontend');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
