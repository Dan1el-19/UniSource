## Contributing and Release Workflow

- Use Conventional Commits with scope: `<type>(<scope>): <description>`.
  - Examples: `feat(sdk): add new schema`, `fix(backend): handle cors`.
- Run `pnpm install` to install commit hooks and tools.
- To enable Husky hooks after install, run: `pnpm run prepare` (runs `husky install`).
- Use `pnpm run changeset` to create a changeset file when you want to release `@unisource/sdk`.
- Private apps (`apps/frontend`, `apps/backend`) are not published to npm.
- To bump versions based on changesets: `pnpm run changeset:version`.
- To inspect the release plan before bumping: `pnpm run changeset:status`.
- To publish via changesets: `pnpm run changeset:publish`.
- Optionally use `npx cz` or `pnpm dlx commitizen` to create commits interactively.

This repository enforces commit message format via commitlint (hook installed with Husky). Changesets are used to manage release versioning for the public SDK package in the monorepo.
