module.exports = {
  apps: [
    {
      name: 'homestay-api',
      script: 'dist/src/main.js',
      cwd: 'C:\\website\\backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
