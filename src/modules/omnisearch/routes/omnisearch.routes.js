const express = require("express");
const { protect } = require("../../../middlewares/auth.middleware");
const omnisearchController = require("../controllers/omnisearch.controller");

const router = express.Router();

router.get("/omni", protect, omnisearchController.search);

module.exports = router;
