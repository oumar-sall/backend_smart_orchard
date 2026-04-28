module.exports = {
  apps : [{
    name: "smart-orchard-api",
    script: "./index.js",
    env: {
      NODE_ENV: "production",
    },
    error_file: "./data/logs/pm2-error.log",
    out_file: "./data/logs/pm2-out.log",
    time: true
  }]
};
