// Minimal flat config without external plugins so `npx eslint` works on a fresh install.
// Upgrade to @eslint/js + typescript-eslint when the team adopts lint gating.
export default [
  {
    ignores: ['dist/**', '.astro/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'],
  },
  {
    rules: {},
  },
];
