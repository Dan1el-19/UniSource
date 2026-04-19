```txt
pnpm install
pnpm dev
```

```txt
pnpm deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
pnpm cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

## Tests

```txt
pnpm test
pnpm check
```

`pnpm test` runs the e2e suite in the Cloudflare Workers Vitest pool.
`pnpm check` type-checks the app and tests, then runs the same e2e suite.

## Releases

`apps/backend` is a private workspace package (`"private": true`) and is not
published to npm.

Versioning and publishing automation in this monorepo is handled with
Changesets for the public `@unisource/sdk` package.

To ship backend changes, deploy the current code revision:

```txt
pnpm build
pnpm deploy
```
