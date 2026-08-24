const express = require("express");

const { protect } = require("../../../middlewares/auth.middleware");
const AppError = require("../../../utils/appError");
const backupController = require("../controllers/backup.controller");

const router = express.Router();

const requireBackupAdminRole = (req, res, next) => {
  const allowedRoles = ["SUPER_OWNER", "BRANCH_OWNER", "ADMIN"];
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return next(
      new AppError(
        "Only Super Owner, Branch Owner, or Admin can access database backups.",
        403,
        "FORBIDDEN"
      )
    );
  }
  return next();
};

router.use(protect);
router.use(requireBackupAdminRole);

router.get("/export", backupController.exportBackup);
router.get("/scheduled", backupController.getScheduledBackups);
router.get("/scheduled/:filename", backupController.downloadScheduledBackup);
router.post("/restore", backupController.restoreBackup);

module.exports = router;
