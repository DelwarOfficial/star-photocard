import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [environment, action = 'build'] = process.argv.slice(2);
if (!['staging', 'production'].includes(environment) || !['build', 'deploy'].includes(action)) {
  throw new Error('Use staging|production build|deploy');
}
function run(args) {
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit', env: { ...process.env, CLOUDFLARE_ENV: environment },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(['node_modules/astro/bin/astro.mjs', 'check']);
run(['node_modules/astro/bin/astro.mjs', 'build']);
const config = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
const namespaces = environment === 'staging' ? ['1002', '2002'] : ['1003', '2003'];
const names = ['ARTICLE_RATE_LIMITER', 'IMAGE_RATE_LIMITER'];
if (config.name !== 'star-news-photocard-' + environment || !names.every((name, index) =>
  config.ratelimits.some(binding => binding.name === name && binding.namespace_id === namespaces[index]))) {
  throw new Error('Generated configuration does not match selected environment');
}
console.log('Verified ' + config.name + ' and both limiter namespaces.');
if (action === 'deploy') run(['node_modules/wrangler/bin/wrangler.js', 'deploy']);
