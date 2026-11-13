const fs = require("node:fs");
const path = require("node:path");

const { generateDatabaseSnapshot } = require("./backup.service");

const BACKUP_DIR = process.env.BACKUP_STORAGE_DIR
  ? path.resolve(process.env.BACKUP_STORAGE_DIR)
  : path.resolve(process.cwd(), "backups", "scheduled");

const ensureBackupDir = () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
};

const getManilaParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: parseInt(get("hour"), 10) % 24,
    minute: parseInt(get("minute"), 10),
    second: parseInt(get("second"), 10),
  };
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

const runScheduledBackup = async (label = "SCHEDULED", actor = null) => {
  try {
    ensureBackupDir();
    const snapshot = await generateDatabaseSnapshot(actor);
    const manila = getManilaParts();
    const yyyy = manila.year;
    const mm = manila.month;
    const dd = manila.day;
    const hh = String(manila.hour).padStart(2, "0");
    const min = String(manila.minute).padStart(2, "0");
    const ss = String(manila.second).padStart(2, "0");

    const filename = `arunafeltz-backup-${yyyy}${mm}${dd}-${hh}${min}${ss}-${label}.json`;
    const fullPath = path.join(BACKUP_DIR, filename);

    fs.writeFileSync(fullPath, JSON.stringify(snapshot, null, 2), "utf8");
    console.log(`[Backup Scheduler] Auto backup saved (${label}): ${filename}`);

    purgeOldBackups();

    const stats = fs.statSync(fullPath);
    return {
      filename,
      sizeBytes: stats.size,
      sizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
      createdAt: stats.mtime.toISOString(),
      label,
    };
  } catch (error) {
    console.error("[Backup Scheduler] Scheduled backup failed:", error.message);
    throw error;
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

const initBackupScheduler = async () => {
  ensureBackupDir();

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // If there are currently no backup snapshots (e.g. freshly deployed container),
  // automatically capture a baseline snapshot so recovery points are active right away.
  try {
    const existing = listScheduledBackups();
    if (existing.length === 0) {
      console.log("[Backup Scheduler] Initializing first baseline backup snapshot...");
      await runScheduledBackup("BASELINE-BOOT");
    }
  } catch (initErr) {
    console.warn("[Backup Scheduler] Baseline boot snapshot warning:", initErr.message);
  }

  // Check every 30 seconds against Philippine Standard Time (Asia/Manila)
  schedulerInterval = setInterval(() => {
    const manila = getManilaParts();
    const hour = manila.hour;
    const minute = manila.minute;
    const dateKey = `${manila.year}-${manila.month}-${manila.day}`;

    // Target 11:00 AM PHT
    if (hour === 11 && minute === 0) {
      const slot = `${dateKey}-11AM`;
      if (lastExecutedSlot !== slot) {
        lastExecutedSlot = slot;
        runScheduledBackup("11AM-PHT").catch((err) => {
          console.error("[Backup Scheduler] 11AM backup error:", err.message);
        });
      }
    }

    // Target 6:00 PM (18:00) PHT
    if (hour === 18 && minute === 0) {
      const slot = `${dateKey}-6PM`;
      if (lastExecutedSlot !== slot) {
        lastExecutedSlot = slot;
        runScheduledBackup("6PM-PHT").catch((err) => {
          console.error("[Backup Scheduler] 6PM backup error:", err.message);
        });
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
