const fs = require("node:fs");
const path = require("node:path");

const { generateDatabaseSnapshot, restoreDatabaseSnapshot } = require("../services/backup.service");
const { listScheduledBackups, getScheduledBackupFilePath } = require("../services/backupScheduler.service");
const { restoreDatabaseSchema } = require("../validations/backup.validation");
const { sendSuccess } = require("../../../utils/apiResponse");
const AppError = require("../../../utils/appError");

const exportBackup = async (req, res, next) => {
  try {
    const snapshot = await generateDatabaseSnapshot(req.user);
    const now = new Date();
    const manilaString = now.toLocaleString("en-US", { timeZone: "Asia/Manila" });
    const manila = new Date(manilaString);
    const yyyy = manila.getFullYear();
    const mm = String(manila.getMonth() + 1).padStart(2, "0");
    const dd = String(manila.getDate()).padStart(2, "0");
    const hh = String(manila.getHours()).padStart(2, "0");
    const min = String(manila.getMinutes()).padStart(2, "0");
    const ss = String(manila.getSeconds()).padStart(2, "0");

    const filename = `arunafeltz-backup-${yyyy}${mm}${dd}-${hh}${min}${ss}.json`;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(JSON.stringify(snapshot, null, 2));
  } catch (error) {
    return next(error);
  }
};

const getScheduledBackups = async (req, res, next) => {
  try {
    const backups = listScheduledBackups();
    return sendSuccess(res, {
      message: "Scheduled backups retrieved successfully",
      data: backups,
    });
  } catch (error) {
    return next(error);
  }
};

const downloadScheduledBackup = async (req, res, next) => {
  try {
    const { filename } = req.params;
    const filePath = getScheduledBackupFilePath(filename);

    if (!filePath) {
      throw new AppError("Backup file not found", 404, "FILE_NOT_FOUND");
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
    const readStream = fs.createReadStream(filePath);
    return readStream.pipe(res);
  } catch (error) {
    return next(error);
  }
};

const restoreBackup = async (req, res, next) => {
  try {
    const parsed = restoreDatabaseSchema.parse(req.body);
    const result = await restoreDatabaseSnapshot({
      backupData: parsed.backupData,
      actor: req.user,
      password: parsed.password,
    });

    return sendSuccess(res, {
      message: "Database restored successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  exportBackup,
  getScheduledBackups,
  downloadScheduledBackup,
  restoreBackup,
};
