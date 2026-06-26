# Hybrid Remote Rendering

This repository can render video clips locally and remotely in parallel.

## Defaults

Remote rendering is disabled unless `REMOTE_RENDER_ENABLED=true`.

### Environment

- `REMOTE_RENDER_ENABLED=false`
- `REMOTE_RENDER_HOST=2.24.81.148`
- `REMOTE_RENDER_USER=box`
- `REMOTE_RENDER_PORT=22`
- `REMOTE_RENDER_BASE_DIR=/home/box/youtube-render-worker`
- `REMOTE_RENDER_CONCURRENCY=1`
- `REMOTE_RENDER_CONNECT_TIMEOUT_SECONDS=10`
- `REMOTE_RENDER_COMMAND_TIMEOUT_SECONDS=1800`
- `REMOTE_RENDER_MAX_RETRIES=2`
- `REMOTE_RENDER_FALLBACK_TO_LOCAL=true`
- `REMOTE_RENDER_KEEP_FILES=false`
- `REMOTE_RENDER_VERIFY_HOST_KEY=true`
- `REMOTE_RENDER_KNOWN_HOSTS_FILE=`
- `REMOTE_RENDER_SSH_PRIVATE_KEY=`
- `REMOTE_RENDER_UPLOAD_METHOD=rsync`
- `LOCAL_RENDER_CONCURRENCY=`
- `REMOTE_RENDER_CLEANUP_MAX_AGE_HOURS=24`

## VPS Prep

```bash
ssh-keyscan -H 2.24.81.148 >> ~/.ssh/known_hosts
ssh box@2.24.81.148 'mkdir -p /home/box/youtube-render-worker/jobs && chmod 700 /home/box/youtube-render-worker'
```

## Commands

- Preflight: `npm run render:remote:check`
- Cleanup: `npm run render:remote:cleanup`
- Hybrid test: `npm run render:remote:test`
- Normal render: `npm run render -- <episode-id>`

## Assignment

Clips are sorted by sequence number and distributed by index:

- even index: local
- odd index: remote

## Notes

- Remote jobs use an isolated workspace under `/home/box/youtube-render-worker/jobs/<run-id>/`.
- Shared inputs are uploaded once per run.
- Fallback to local rendering is enabled by default when remote clips fail.
