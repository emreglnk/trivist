module.exports = {
  apps: [
    {
      name: 'trivist-prod',
      script: 'npm',
      args: 'start',
      cwd: '/home/trivist',
      env: {
        PORT: 3000,
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/prod-err.log',
      out_file: './logs/prod-out.log',
      log_file: './logs/prod-combined.log',
      time: true
    }
  ]
};
