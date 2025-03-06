const jwt = require("jsonwebtoken");
const User = require("../models/user");

// exports.authenticateToken = (req, res, next) => {
//   const token = req.cookies.token;

//   if (!token) {
//     return res.status(401).json({ error: "No token provided" });
//   }

//   jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
//     if (err) {
//       return res.status(403).json({ error: "Invalid token" });
//     }

//     req.user = user;
//     next();
//   });
// };
exports.verifyToken = async (req, res, next) => {
  try {
    console.log("Debug: verifyToken middleware accessed.");
    console.log("Debug: Cookies received:", req.cookies);

    // 1. Get token from cookies
    const token = req.cookies.token;
    console.log("Debug: Token received:", token);

    if (!token) {
      console.error("Debug: Unauthorized - No token provided");
      return res
        .status(401)
        .json({ error: "Unauthorized - No token provided" });
    }

    // 2. Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Debug: Decoded JWT:", decoded);

    // 3. Find user in database
    const user = await User.findById(decoded.id).select("-password");
    console.log("Debug: Retrieved user from database:", user);

    if (!user) {
      console.error("Debug: Unauthorized - User not found");
      return res.status(401).json({ error: "Unauthorized - User not found" });
    }

    // 4. Attach user to request object
    req.user = user;
    console.log(
      "Debug: User attached to request. Response from middleware:",
      user
    );
    next();
  } catch (error) {
    console.error("Debug: Error in verifyToken middleware:", error);
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }
    res.status(500).json({ error: error.message });
  }
};
