module.exports = {
  apps : [{
    name: "smart-orchard-api",
    script: "./index.js",
    env: {
      NODE_ENV: "production",
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    time: true
  }]
};
