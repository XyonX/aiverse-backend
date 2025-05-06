module.exports = {
  apps: [
    {
      name: "aiverse-backend",
      script: "server.js",
      env: {
        NODE_ENV: "production",
        PORT: 3001, // This will be used by server.js now
      },
    },
  ],
};
