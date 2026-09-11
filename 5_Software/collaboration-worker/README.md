# InoRobot Collaboration Worker

This Cloudflare Worker provides the public WebSocket backend used by the 3D
Simulation collaboration feature. A Durable Object keeps the live room and
participant state together so up to four browsers can connect to the same room
code.

## Deploy

Authenticate Wrangler once on the deployment machine, then deploy from the
repository root:

```powershell
npx.cmd wrangler login
npx.cmd wrangler deploy --config 5_Software/collaboration-worker/wrangler.toml
```

The production page is configured for:

```text
wss://inorobot-collaboration.hois56.workers.dev/collaboration
```

Verify the Worker after deployment:

```powershell
Invoke-RestMethod https://inorobot-collaboration.hois56.workers.dev/health
```

Do not commit API tokens or secrets. The Worker only accepts browser origins
listed in `ALLOWED_ORIGINS`; local loopback origins remain allowed for local
development and Wrangler preview.
