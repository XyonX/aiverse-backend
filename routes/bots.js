const express = require("express");
const router = express.Router();
const botController = require("../controllers/botController");
const auth = require("../middleware/auth");

router.get("/:id?", botController.getBots);
router.post("/", botController.addBot);
router.put("/:id", botController.editBotbyId);
router.put("/model/:model", botController.editBotbyId);

module.exports = router;
