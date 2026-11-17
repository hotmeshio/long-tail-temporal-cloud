// Run one order through the handoff against a running cloud: start it, report
// production and the pickup scan as a bot, and check that the order ends as shipped.
//
//   LT_URL=https://cloud.example.com LT_ADMIN_USER=superadmin LT_ADMIN_PASSWORD=... npm run smoke
try { require('dotenv/config'); } catch { /* env comes from the shell */ }

import { envRequired, envStr } from '../src/modules/config';
import { runHandoffSmoke } from '../src/services/handoff-smoke';

async function main(): Promise<void> {
  const url = envStr(process.env, 'LT_URL', `http://localhost:${envStr(process.env, 'APP_PORT', '3600')}`).replace(/\/+$/, '');
  const result = await runHandoffSmoke(url, {
    username: envStr(process.env, 'LT_ADMIN_USER', 'superadmin'),
    password: envRequired(process.env, 'LT_ADMIN_PASSWORD'),
  });
  console.log(`order ${result.orderId}: ${result.status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
