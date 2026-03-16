const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const cron = require('node-cron');
const { resolveBackupDirectory, resolvePocketBaseDirectory, resolveDataDirectory } = require('./pathConfig');

let currentCronJob = null;

async function createBackup() {
  return new Promise(async (resolve, reject) => {
    try {
      const backupDir = resolveBackupDirectory();
      const dbDir = resolvePocketBaseDirectory();
      const dataDir = resolveDataDirectory();
      const configFile = path.join(dataDir, 'config.json');

      if (!fs.existsSync(backupDir)) {
        await fs.promises.mkdir(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `backup-${timestamp}.zip`;
      const backupPath = path.join(backupDir, backupFilename);

      const output = fs.createWriteStream(backupPath);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      output.on('close', () => {
        resolve(backupFilename);
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);

      if (fs.existsSync(dbDir)) {
        archive.directory(dbDir, 'db');
      }

      if (fs.existsSync(configFile)) {
        archive.file(configFile, { name: 'config.json' });
      }

      await archive.finalize();
    } catch (err) {
      reject(err);
    }
  });
}

async function cleanupOldBackups(maxCount) {
  try {
    if (!Number.isFinite(maxCount) || maxCount < 1) return;
    const backupDir = resolveBackupDirectory();
    if (!fs.existsSync(backupDir)) return;

    const files = await fs.promises.readdir(backupDir);
    const backupFiles = files.filter(f => f.startsWith('backup-') && f.endsWith('.zip'));

    // Sort descending by name (which contains timestamp)
    backupFiles.sort((a, b) => b.localeCompare(a));

    const toDelete = backupFiles.slice(maxCount);
    for (const file of toDelete) {
      await fs.promises.unlink(path.join(backupDir, file));
    }
  } catch (err) {
    console.error('Error cleaning up old backups:', err);
  }
}

function scheduleBackup(appConfig) {
  if (currentCronJob) {
    currentCronJob.stop();
    currentCronJob = null;
  }

  const backupConfig = appConfig?.backup;
  if (!backupConfig || !backupConfig.cron || !cron.validate(backupConfig.cron)) {
    return;
  }

  currentCronJob = cron.schedule(backupConfig.cron, async () => {
    try {
      console.log('Starting scheduled backup...');
      await createBackup();
      await cleanupOldBackups(backupConfig.maxCount);
      console.log('Scheduled backup completed successfully.');
    } catch (err) {
      console.error('Scheduled backup failed:', err);
    }
  });
}

module.exports = {
  createBackup,
  cleanupOldBackups,
  scheduleBackup
};
