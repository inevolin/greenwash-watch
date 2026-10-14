// pm2 config for nevolin.be/greenwashing-watchdog. Secrets come from .env (not committed).
module.exports = {
  apps: [{
    name: 'greenwash-watch',
    script: 'server.js',
    cwd: __dirname,
    node_args: '--max-old-space-size=256',
    max_memory_restart: '320M',
    env: {
      PORT: 3300,
      NODE_OPTIONS: '--max-old-space-size=256',
      BASE_PATH: '/greenwashing-watchdog',
      TRUST_PROXY: '1',
      DATA_DIR: '/root/apps/greenwash-watch-data',
      RATE_PER_IP_PER_HOUR: '2',
      RATE_GLOBAL_PER_DAY: '20',
      BUDGET_CENTS: '300',
    },
  }],
};
