## Contributing and Release Workflow

- Conventional Commits with scope are recommended for readable git history (not enforced by tooling).
  - Examples: `feat(sdk): add new schema`, `fix(backend): handle cors`.
- Use `pnpm run changeset` to create a changeset file when you want to release `@unisource/sdk`.
- Private apps (`apps/frontend`, `apps/backend`) are not published to npm.
- To bump versions based on changesets: `pnpm run changeset:version`.
- To inspect the release plan before bumping: `pnpm run changeset:status`.
- To publish via changesets: `pnpm run changeset:publish`.
- Optionally use `npx cz` or `pnpm dlx commitizen` to create commits interactively.
- For private app releases, use SemVer tags only as CI/CD triggers:
  - `git tag backend@1.2.0 && git push origin backend@1.2.0`
  - `git tag frontend@2.0.0 && git push origin frontend@2.0.0`

GitHub Actions workflows are triggered by changed paths (`paths:`), not commit message content.
