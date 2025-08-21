module.exports = {
  apps: [
    {
      name: 'trivist-dev-prod',
      script: 'npm',
      args: 'run dev',
      cwd: '/home/trivist',
      env: {
        PORT: 3000,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: 1
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/dev-prod-err.log',
      out_file: './logs/dev-prod-out.log',
      log_file: './logs/dev-prod-combined.log',
      time: true,
      kill_timeout: 5000
    }
  ]
};
