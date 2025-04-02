const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { authorize } = require("../middleware/authorize");
const processProfileData = require("../middleware/processProfileData");

router.post("/register", authenticate, authController.register);
router.post("/login", authenticate, authController.login);
router.get("/me", authenticate, authorize, authController.me); // Protected route
router.patch(
  "/updateprofile",
  processProfileData.single("avatar"),
  authenticate,
  authorize,
  authController.update
);

module.exports = router;
