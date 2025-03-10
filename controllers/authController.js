const User = require("../models/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check existing user
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();

    // Sanitize response
    const sanitizedUser = {
      _id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      avatar: newUser.avatar,
      bots: newUser.bots,
      createdAt: newUser.createdAt,
    };

    res.status(201).json({
      message: "Registration successful",
      user: sanitizedUser,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Fetch user with password for validation
    const user = await User.findOne({ username }).select("+password");

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    // Set secure cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
    });

    // Sanitize user object
    const sanitizedUser = {
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      bots: user.bots,
      createdAt: user.createdAt,
      // Include other non-sensitive fields as needed
    };

    // Send response with user data
    res.status(200).json({
      message: "Login successful",
      user: sanitizedUser,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.me = async (req, res) => {
  console.log("Debug: Authorization header:", req.headers.authorization);

  try {
    console.log("Debug: /me endpoint accessed. Request user:", req.user);
    const user = req.user;

    if (!user) {
      console.error(
        "Debug: Unauthorized access - no user attached to request."
      );
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Return sanitized user data
    const sanitizedUser = {
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      bots: user.bots,
      createdAt: user.createdAt,
    };

    console.log("Debug: Responding with sanitized user data:", sanitizedUser);
    res.json({ user: sanitizedUser });
  } catch (error) {
    console.error("Debug: Error in /me controller:", error);
    res.status(500).json({ error: error.message });
  }
};
