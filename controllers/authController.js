const User = require("../models/user");
const bcrypt = require("bcrypt");
const admin = require("../config/firebaseAdmin"); // Your initialized firebase-admin instance

exports.register = async (req, res) => {
  try {
    console.log("Received request at /register");
    console.log("Request body:", req.body);

    const { idToken, username } = req.body;
    console.log("Extracted idToken:", idToken);
    console.log("Extracted username:", username);

    // Verify the Firebase ID token
    console.log("Verifying Firebase ID token...");
    //this contains data like email,password
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log("Decoded token:", decodedToken);

    const { uid, email } = decodedToken;
    console.log("Extracted UID:", uid);
    console.log("Extracted email:", email);

    // Check if the user already exists in your MongoDB collection
    console.log("Checking if user already exists in database...");
    const existingUser = await User.findOne({ firebaseUid: uid });
    if (existingUser) {
      console.log("User already exists:", existingUser);
      return res.status(400).json({ error: "User already exists" });
    }

    // Create a new user document
    console.log("Creating new user in database...");
    const newUser = new User({
      firebaseUid: uid,
      username,
      email,
    });
    await newUser.save();
    console.log("New user saved successfully:", newUser);

    // Sanitize response
    const sanitizedUser = {
      _id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      avatar: newUser.avatar,
      bots: newUser.bots,
      createdAt: newUser.createdAt,
    };
    console.log("Sanitized user response:", sanitizedUser);

    res.status(201).json({
      message: "Registration successful",
      user: sanitizedUser,
    });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    console.log("Login request received");
    const { idToken } = req.body;

    if (!idToken) {
      console.error("Missing idToken in request");
      return res.status(400).json({ error: "Missing idToken" });
    }
    console.log("ID Token received:", idToken);

    // Verify the Firebase ID token
    console.log("Verifying Firebase ID token...");
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid } = decodedToken;
    console.log("Decoded token UID:", uid);

    // Find the corresponding user in MongoDB
    console.log("Searching for user in database...");
    const user = await User.findOne({ firebaseUid: uid });

    if (!user) {
      console.error("User not found in database");
      return res.status(401).json({ error: "User not found" });
    }
    console.log("User found:", user);

    // Sanitize response
    const sanitizedUser = {
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      bots: user.bots,
      preferences: user.preferences,
      createdAt: user.createdAt,
    };
    console.log("Sanitized user data prepared");

    res.status(200).json({
      message: "Login successful",
      user: sanitizedUser,
    });
    console.log("Login successful, response sent");
  } catch (error) {
    console.error("Error during login:", error.message);
    res.status(500).json({ error: error.message });
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
      email: user.email,
      avatar: user.avatar,
      bots: user.bots,
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
