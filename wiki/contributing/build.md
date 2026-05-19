---
name: build
description: How to build and run the ClawAgent dashboard Docker image.
---

# Building and Running the Dashboard Docker Image

## Building the Image

Run the following command from the repository root:

```sh
docker build -f docker/Dockerfile.dashboard -t clawagent:<version> .
```

The build context must be the repo root so that the Dockerfile can access all workspace packages.

## Required Environment Variables

The container requires these environment variables at runtime:

| Variable | Description |
|---|---|
| `CLAW_AGENT_DATABASE_URL` | PostgreSQL connection URL (e.g. `postgres://user:pass@host:5432/db`). Validated as a URL at startup — an invalid value will cause the app to fail immediately. |
| `BETTER_AUTH_SECRET` | Secret key used by Better Auth to sign sessions and tokens. You can also use openssl rand -base64 32 to generate one. |

## Running the Container

Pass environment variables via an env file:

```sh
docker run -p 3000:3000 --env-file <your-env-file> clawagent:<version>
```

The app listens on port 3000 inside the container. Adjust the host-side port mapping (`-p <host>:3000`) as needed.

## Important Notes

**Secrets are not baked into the image.** The `.env` file is excluded via `.dockerignore`, so secrets must be injected at runtime using `--env-file`, `-e`, or your orchestration platform's secret management.

