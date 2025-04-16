const express = require("express");
const router = express.Router();
const botController = require("../controllers/botController");
const auth = require("../middleware/auth");
const processBotData = require("../middleware/processBotData");

router.get("/:id?", botController.getBots);
router.post("/", botController.addBot);
router.put("/:id", botController.editBotbyId);
router.put("/model/:model", botController.editBotbyId);
router.post(
  "/custom",
  processBotData.single("avatar"),
  authenticate,
  authorize,
  botController.createCustomBot
);

module.exports = router;
