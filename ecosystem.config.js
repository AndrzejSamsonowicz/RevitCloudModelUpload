// PM2 process definition for the VM deployment.
// Start with:  pm2 start ecosystem.config.js
// See VM_FIREBASE_INTEGRATION_GUIDE.md §8.
module.exports = {
  apps: [{
    name: 'revit-publisher',
    script: 'server.js',
    instances: 1,
    // Explicit fork mode: with an `instances` key present, PM2 otherwise defaults to
    // cluster mode, which caused a post-reboot crash-loop for this app pattern.
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '600M',
    // server.js self-loads .env via `require('dotenv').config()` — no env block here,
    // so .env stays the single source of truth for config.
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    time: true
  }]
};
