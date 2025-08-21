module.exports = {
  apps: [
    {
      name: 'trivist-app',
      script: 'npm',
      args: 'run dev',
      cwd: '/home/trivist',
      env: {
        PORT: 3000,
        NODE_ENV: 'development'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true
    }
  ]
};
