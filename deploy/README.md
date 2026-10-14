# Deploy: nevolin.be/greenwashing-watchdog

- Server: DigitalOcean droplet; nginx vhost `nevolin.be` proxies `/greenwashing-watchdog/` to `127.0.0.1:3300` (see `nginx-location.conf`).
- App: `/root/apps/greenwash-watch` (git checkout), saved reports in `/root/apps/greenwash-watch-data`, pm2 app **`greenwash-watch`** (memory capped via `ecosystem.config.js`). Never `pm2 reload all`.
- Secrets on the server: `/root/apps/greenwash-watch/.env` (chmod 600) with `ANTHROPIC_API_KEY`, `AGENT_ID`, `ENVIRONMENT_ID`. Never committed.

## GitHub Actions secrets (repo → Settings → Secrets → Actions)
| Secret | Value |
|---|---|
| `SSH_PRIVATE_KEY` | private key of the dedicated `greenwash-watch-deploy` key (its public key is in root's `authorized_keys`) |
| `SSH_KNOWN_HOSTS` | output of `ssh-keyscan -H <server>` |
| `SERVER_IP` | server IP |
| `SERVER_USER` | `root` |

Push to `main` (or run the workflow manually) → SSH → `deploy/deploy.sh` → pm2 restart of `greenwash-watch` only → public health check.
