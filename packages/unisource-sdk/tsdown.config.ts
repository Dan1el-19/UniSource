import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: {
    tsgo: true,
  },
  // exports: true intentionally omitted — tsdown's auto-generation overwrites the
  // carefully structured exports field in package.json (with nested types/import/default)
  // on every build. Package exports are maintained manually in package.json instead.
})
