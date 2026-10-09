import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
export default defineConfig(
 { ignores: ['dist/**', '.astro/**', 'node_modules/**', 'worker-configuration.d.ts', '.agents/**', '.agent/**', '.opencode/**', '.gemini/**', 'playwright-report/**', 'test-results/**', '.edit.mjs', 'src/env.d.ts'] },
 ...tseslint.configs.recommended,
 { files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', 'scripts/**/*.mjs'], rules: {
 '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
 'no-constant-condition': ['error', {checkLoops:false}], 'no-unreachable':'error'
 }});
