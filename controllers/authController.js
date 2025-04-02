const User = require("../models/user");
const bcrypt = require("bcrypt");
const admin = require("../config/firebaseAdmin"); // Your initialized firebase-admin instance

exports.register = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const { username, email } = req.body;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing authorization header" });
    }

    const idToken = authHeader.split(" ")[1];
    const firebaseUser = await admin.auth().verifyIdToken(idToken);

    // Check if user already exists
    const existingUser = await User.findOne({ firebaseUid: firebaseUser.uid });
    if (existingUser) {
      console.log("User already exists:", existingUser);
      return res.status(409).json({ error: "User already exists" });
    }

    // Create a new user document in your database
    console.log("Creating new user in database...");
    const newUser = new User({
      firebaseUid: firebaseUser.uid,
      username,
      email,
    });
    await newUser.save();
    console.log("New user saved successfully:", newUser);

    // Return only a success message
    return res.status(201).json({ message: "Registration successful" });
  } catch (error) {
    console.error("Error during registration:", error);
    return res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    console.log("Login request received");

    const authHeader = req.headers.authorization;
    console.log("Authorization header:", authHeader);

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("Auth header missing or not properly formatted");
      return res
        .status(401)
        .json({ error: "Missing or malformed authorization header" });
    }

    const idToken = authHeader.split(" ")[1];
    console.log("Extracted ID token:", idToken);

    // Verify the token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log("Token successfully verified. User ID:", decodedToken.uid);

    // Token is valid, send a simple success response
    return res
      .status(200)
      .json({
        loggedIn: true,
        message: "Login successful",
        uid: decodedToken.uid,
      });
  } catch (error) {
    console.error("Error in login:", error);
    return res
      .status(401)
      .json({ loggedIn: false, error: "Invalid or expired token" });
  }
};

exports.me = async (req, res) => {
  console.log("[me] Endpoint accessed.");
  console.log("[me] Authorization header:", req.headers.authorization);

  try {
    console.log("[me] Request user:", JSON.stringify(req.user, null, 2));
    const user = req.user;

    if (!user) {
      console.error("[me] Unauthorized access - no user attached to request.");
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Return sanitized user data
    const sanitizedUser = {
      _id: user._id,
      username: user.username,
      email: user.email, //doont send this
      avatar: user.avatar,
      about: user.about,
      bots: user.bots,
      favouriteBots: user.favouriteBots,
      preferences: user.preferences,
      createdAt: user.createdAt,
    };

    console.log(
      "[me] Responding with sanitized user data:",
      JSON.stringify(sanitizedUser, null, 2)
    );
    res.json({ user: sanitizedUser });
  } catch (error) {
    console.error("[me] Error in /me controller:", error);
    res.status(500).json({ error: error.message });
  }
};
exports.update = async (req, res) => {
  console.log("Update request received for user:", req.user._id);
  try {
    const { description, preferences } = req.body;
    console.log("Request body:", { description, preferences });

    // Basic validation for required fields
    if (!description || !preferences) {
      console.warn(
        "Missing required fields. Description or preferences not provided."
      );
      return res
        .status(400)
        .json({ error: "Description and preferences are required" });
    }

    // Construct update data
    const updateData = {
      about: description,
      preferences: JSON.parse(preferences), // If preferences is sent as a JSON string
    };

    // Add avatar path only if file exists
    if (req.file) {
      updateData.avatar = `/uploads/avatars/${req.file.filename}`;
      console.log("Avatar file detected:", req.file.filename);
    } else {
      console.log("No avatar file provided.");
    }

    console.log("Update data being used:", updateData);

    // Update user
    const updatedUser = await User.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
      runValidators: true, // Validate against schema
    });

    if (!updatedUser) {
      console.error("User not found for update:", req.user._id);
      return res.status(404).json({ error: "User not found" });
    }

    console.log("User updated successfully:", updatedUser);
    res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({
      error: error.message || "Server error during profile update",
    });
  }
};
