const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");
const processProfileData = require("../middleware/processprofiledata");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/me", verifyToken, authController.me); // Protected route
router.patch(
  "/updateprofile",
  processProfileData.single("avatar"),
  verifyToken,
  authController.update
);

module.exports = router;
