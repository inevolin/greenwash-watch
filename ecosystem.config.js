// pm2 config for nevolin.be/greenwashing-watchdog. Secrets come from .env (not committed).
module.exports = {
  apps: [{
    name: 'greenwash-watch',
    script: 'server.js',
    cwd: __dirname,
    node_args: '--max-old-space-size=192',
    max_memory_restart: '256M',
    env: {
      PORT: 3300,
      BASE_PATH: '/greenwashing-watchdog',
      TRUST_PROXY: '1',
      DATA_DIR: '/var/www/greenwash-watch-data',
      RATE_PER_IP_PER_HOUR: '2',
      RATE_GLOBAL_PER_DAY: '20',
      BUDGET_CENTS: '300',
    },
  }],
};
