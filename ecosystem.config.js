module.exports = {
  apps: [
    {
      name: "aiverse-backend",
      script: "server.js",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3001, // This ensures you are using the port from .env
      },
    },
  ],
};
