// const admin = require("firebase-admin");

// exports.authenticate = async (req, res, next) => {
//   try {
//     const authHeader = req.headers.authorization;

//     if (!authHeader || !authHeader.startsWith("Bearer ")) {
//       return res.status(401).json({ error: "Missing authorization header" });
//     }

//     const idToken = authHeader.split(" ")[1];
//     const decodedToken = await admin.auth().verifyIdToken(idToken);
//     req.user = decodedToken; // Attach user info to request
//     next(); // Proceed to the next middleware
//   } catch (error) {
//     console.error("Authentication error:", error);
//     res.status(401).json({ error: "Invalid or expired token" });
//   }
// };

const admin = require("firebase-admin");

exports.authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("Missing or invalid authorization header");
      return res.status(401).json({ error: "Missing authorization header" });
    }

    const idToken = authHeader.split(" ")[1];

    const decodedToken = await admin.auth().verifyIdToken(idToken);

    req.user = decodedToken; // Attach user info to request
    next(); // Proceed to the next middleware
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
