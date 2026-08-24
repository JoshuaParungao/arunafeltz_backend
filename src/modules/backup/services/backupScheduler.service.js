const fs = require("node:fs");
const path = require("node:path");

const { generateDatabaseSnapshot } = require("./backup.service");

const BACKUP_DIR = path.resolve(process.cwd(), "backups", "scheduled");

const ensureBackupDir = () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
};

const getManilaTime = () => {
  const now = new Date();
  const manilaString = now.toLocaleString("en-US", { timeZone: "Asia/Manila" });
  return new Date(manilaString);
};

const purgeOldBackups = () => {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > FOURTEEN_DAYS_MS) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (error) {
    console.error("[Backup Scheduler] Error purging old backups:", error.message);
  }
};

const runScheduledBackup = async (label = "SCHEDULED") => {
  try {
    ensureBackupDir();
    const snapshot = await generateDatabaseSnapshot(null);
    const manila = getManilaTime();
    const yyyy = manila.getFullYear();
    const mm = String(manila.getMonth() + 1).padStart(2, "0");
    const dd = String(manila.getDate()).padStart(2, "0");
    const hh = String(manila.getHours()).padStart(2, "0");
    const min = String(manila.getMinutes()).padStart(2, "0");
    const ss = String(manila.getSeconds()).padStart(2, "0");

    const filename = `arunafeltz-backup-${yyyy}${mm}${dd}-${hh}${min}${ss}-${label}.json`;
    const fullPath = path.join(BACKUP_DIR, filename);

    fs.writeFileSync(fullPath, JSON.stringify(snapshot, null, 2), "utf8");
    console.log(`[Backup Scheduler] Auto backup saved (${label}): ${filename}`);

    purgeOldBackups();
  } catch (error) {
    console.error("[Backup Scheduler] Scheduled backup failed:", error.message);
  }
};

const listScheduledBackups = () => {
  ensureBackupDir();
  const files = fs.readdirSync(BACKUP_DIR);
  const backups = [];

  for (const file of files) {
    if (file.endsWith(".json")) {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      backups.push({
        filename: file,
        sizeBytes: stats.size,
        sizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
        createdAt: stats.mtime.toISOString(),
      });
    }
  }

  backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return backups;
};

const getScheduledBackupFilePath = (filename) => {
  const safeFilename = path.basename(filename);
  const filePath = path.join(BACKUP_DIR, safeFilename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return filePath;
};

let schedulerInterval = null;
let lastExecutedSlot = "";

const initBackupScheduler = () => {
  ensureBackupDir();

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Check every 30 seconds against Philippine Standard Time (Asia/Manila)
  schedulerInterval = setInterval(() => {
    const manila = getManilaTime();
    const hour = manila.getHours();
    const minute = manila.getMinutes();
    const dateKey = `${manila.getFullYear()}-${manila.getMonth() + 1}-${manila.getDate()}`;

    // Target 11:00 AM PHT
    if (hour === 11 && minute === 0) {
      const slot = `${dateKey}-11AM`;
      if (lastExecutedSlot !== slot) {
        lastExecutedSlot = slot;
        runScheduledBackup("11AM-PHT");
      }
    }

    // Target 6:00 PM (18:00) PHT
    if (hour === 18 && minute === 0) {
      const slot = `${dateKey}-6PM`;
      if (lastExecutedSlot !== slot) {
        lastExecutedSlot = slot;
        runScheduledBackup("6PM-PHT");
      }
    }
  }, 30000);

  console.log("[Backup Scheduler] Initialized. Schedules: 11:00 AM & 6:00 PM (Asia/Manila PHT).");
};

module.exports = {
  BACKUP_DIR,
  initBackupScheduler,
  listScheduledBackups,
  getScheduledBackupFilePath,
  runScheduledBackup,
};
