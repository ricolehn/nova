const fs = require('fs');
const path = require('path');

function resolveDataDirectory({ env = process.env } = {}) {
  if (env.DATA_DIR) {
    return path.resolve(env.DATA_DIR);
  }

  return path.join(__dirname, '..', 'data');
}

function resolveFrontendDirectory({ env = process.env, existsSync = fs.existsSync } = {}) {
  if (env.FRONTEND_DIR) {
    return path.resolve(env.FRONTEND_DIR);
  }

  const htmlDir = path.join(__dirname, '..', 'html');
  if (existsSync(htmlDir)) {
    return htmlDir;
  }

  return path.join(__dirname, '..');
}

module.exports = {
  resolveDataDirectory,
  resolveFrontendDirectory
};
