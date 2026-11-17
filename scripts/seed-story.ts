// Start the story's orders against a running cloud and print the queue each
// waits in. Orders that are already there are left as they are.
//
//   LT_URL=https://cloud.example.com LT_ADMIN_USER=superadmin LT_ADMIN_PASSWORD=... npm run seed:story
//
// With --report-production a bot reports production for the last order, so it
// waits for the carrier without a site running.
try { require('dotenv/config'); } catch { /* env comes from the shell */ }

import { envRequired, envStr } from '../src/modules/config';
import { STORY_ORDER_IDS } from '../src/modules/order-fixtures';
import { seedStory } from '../src/services/story-seed';

const REPORT_PRODUCTION_FLAG = '--report-production';

async function main(): Promise<void> {
  const url = envStr(process.env, 'LT_URL', `http://localhost:${envStr(process.env, 'APP_PORT', '3600')}`).replace(/\/+$/, '');
  const lastOrder = STORY_ORDER_IDS[STORY_ORDER_IDS.length - 1];
  const story = await seedStory(
    url,
    { username: envStr(process.env, 'LT_ADMIN_USER', 'superadmin'), password: envRequired(process.env, 'LT_ADMIN_PASSWORD') },
    { reportProduction: process.argv.includes(REPORT_PRODUCTION_FLAG) ? [lastOrder] : [] },
  );
  for (const order of story) {
    console.log(`order ${order.orderId}: ${order.started ? 'started' : 'already there'}, waiting in ${order.waitingIn}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
