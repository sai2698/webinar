module.exports = {
  apps: [
    {
      name: 'webinar-server',
      cwd: './apps/server',
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '450M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
    {
      name: 'webinar-web',
      cwd: './apps/web',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '450M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
