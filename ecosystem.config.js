// PM2 process file — usage: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "clau-ai",
      script: "node_modules/next/dist/bin/next",
      // Listen on localhost only; Nginx is the public entry point.
      args: `start -H 127.0.0.1 -p ${process.env.PORT || 3000}`,
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
