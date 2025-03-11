const jwt = require("jsonwebtoken");
const User = require("../models/user");
const admin = require("firebase-admin");

exports.verifyToken = async (req, res, next) => {
  try {
    console.log("[verifyToken] Middleware accessed.");
    console.log(
      "[verifyToken] Request headers:",
      JSON.stringify(req.headers, null, 2)
    );

    // 1. Get token from Authorization header or cookies
    let idToken;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      idToken = req.headers.authorization.split("Bearer ")[1];
    } else if (req.cookies && req.cookies.token) {
      idToken = req.cookies.token;
    }

    console.log("[verifyToken] Extracted Token:", idToken);

    if (!idToken) {
      console.error("[verifyToken] Unauthorized - No token provided");
      return res
        .status(401)
        .json({ error: "Unauthorized - No token provided" });
    }

    // 2. Verify the token using Firebase Admin SDK
    console.log("[verifyToken] Verifying Firebase ID token...");
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log(
      "[verifyToken] Decoded Firebase Token:",
      JSON.stringify(decodedToken, null, 2)
    );

    // 3. Find the corresponding user in MongoDB using firebaseUid
    console.log("[verifyToken] Searching for user in database...");
    const user = await User.findOne({ firebaseUid: decodedToken.uid }).select(
      "-password"
    );
    console.log("[verifyToken] Retrieved User from Database:", user);

    if (!user) {
      console.error("[verifyToken] Unauthorized - User not found");
      return res.status(401).json({ error: "Unauthorized - User not found" });
    }

    // 4. Attach the user to the request object
    req.user = user;
    console.log(
      "[verifyToken] User attached to request:",
      JSON.stringify(user, null, 2)
    );

    console.log(
      "[verifyToken] Middleware execution successful. Moving to next handler."
    );
    next();
  } catch (error) {
    console.error("[verifyToken] Error in middleware:", error);
    return res.status(401).json({ error: "Unauthorized - Invalid token" });
  }
};
