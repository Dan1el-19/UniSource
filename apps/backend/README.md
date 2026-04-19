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

Releases are created by `semantic-release` from Conventional Commits on `main`.
Use `feat:` for a minor release, `fix:` for a patch release, and the standard
`BREAKING CHANGE` footer for a major release.

The release workflow uses a GitHub token stored as `SEMANTIC_RELEASE_TOKEN`.
Do not use `GITHUB_TOKEN` for that secret, because releases created with
`GITHUB_TOKEN` do not trigger downstream `release.published` workflows.

After a GitHub release is published, a separate workflow deploys the tagged
release to Cloudflare Workers.
