const User = require("../models/user");

exports.authorize = async (req, res, next) => {
  try {
    const firebaseUser = req.user;
    if (!firebaseUser) {
      return res
        .status(403)
        .json({ error: "Authentication Middleware verification failed" });
    }

    const firebaseUid = firebaseUser.uid;
    const user = await User.findOne({ firebaseUid }).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not registered" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Authorization error:", error);
    res.status(500).json({ error: "Authorization check failed" });
  }
};
