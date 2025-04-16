module.exports = {
  apps: [
    {
      name: "aiverse-backend",
      script: "server.js",
      env: {
        NODE_ENV: "production",
        PORT: 443, // This ensures you are using the port from .env
      },
    },
  ],
};
