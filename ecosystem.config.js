module.exports = {
  apps: [
    {
      name: "arunafeltz-backend",
      script: "src/server.js",
      instances: 2,
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "3G",
      listen_timeout: 5000,
      kill_timeout: 3000,
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      error_file: "./logs/error.log",
      out_file: "./logs/output.log",
      env: {
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
