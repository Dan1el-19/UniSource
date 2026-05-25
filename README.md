# UniSource

![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-yes-3178C6)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020)
![npm](https://img.shields.io/npm/v/@unisource/sdk)

UniSource is open-source code for a self-hosted backend platform.
It provides a central API, TypeScript SDK and admin panel for apps that need storage, sharing, releases and service-level configuration.

## What is UniSource?

UniSource is a backend foundation you can run on your own infrastructure. The repo contains the code for the API layer, the admin panel and the SDK used by external apps.

The source code is public, but this is **not** a public hosted API. If you use UniSource, you deploy your own instance with your own credentials, storage and runtime setup.

The idea is simple: instead of building a new backend from scratch for every app, extend UniSource with new modules/endpoints and expose them through `@unisource/sdk` (or future packages).

## What this is not

- not a public hosted API
- not a polished SaaS product
- not an enterprise-audited backend
- not a one-command deployment

## What's inside?

- `apps/backend`: Hono API on Cloudflare Workers
- `apps/frontend`: admin/control panel
- `packages/unisource-sdk`: TypeScript SDK
- `docs/`, `scripts/`, configs: project support files

## How it fits together

```text
External app
   ↓
@unisource/sdk
   ↓
UniSource API / Cloudflare Worker
   ├─ D1 database
   ├─ R2 storage
   ├─ Appwrite auth/storage
   └─ Admin panel
```

A real example consumer is Chmura Blokserwis (separate frontend app), which uses the UniSource API and `@unisource/sdk`.

## Project status

UniSource is a side project, actively evolving, and already used in real deployments.

Stable API paths exist today, while API v2 is being developed through beta SDK releases. Expect rough edges and possible breaking changes on beta paths before stabilization.

## Development model

UniSource is heavily AI-built and human-directed.

Most implementation is produced with AI coding tools/agents, while architecture direction, infrastructure decisions, prompting strategy, research and release flow are human-guided.

If you plan serious production use, review the code and deployment model carefully in your own environment.

## Getting started

```bash
pnpm install
pnpm --filter backend dev
pnpm --filter frontend dev
pnpm --filter @unisource/sdk build
```

Detailed setup for Cloudflare, D1, R2, Appwrite, secrets and deployment belongs in [`docs/setup.md`](docs/setup.md).

## Documentation

- [Backend docs](apps/backend/README.md)
- [SDK docs](packages/unisource-sdk/README.md)
- [Contributing](CONTRIBUTING.md)
- [Agent instructions](AGENTS.md)
- [Setup notes](docs/setup.md)

## License

UniSource is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
