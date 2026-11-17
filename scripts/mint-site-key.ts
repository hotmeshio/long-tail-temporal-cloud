// Mint the key a factory site calls this cloud with. Prints CLOUD_API_KEY and
// CLOUD_BOT_ID for the site's environment. The site bot's earlier key is revoked.
//
//   LT_URL=https://cloud.example.com LT_ADMIN_USER=superadmin LT_ADMIN_PASSWORD=... npm run site-key
try { require('dotenv/config'); } catch { /* env comes from the shell */ }

import { envRequired, envStr } from '../src/modules/config';
import { BOT, ROLE, ROLE_TYPE } from '../src/modules/constants';
import { issueBotKey } from '../src/services/bot-key';

async function main(): Promise<void> {
  const url = envStr(process.env, 'LT_URL', `http://localhost:${envStr(process.env, 'APP_PORT', '3600')}`).replace(/\/+$/, '');
  const issued = await issueBotKey(
    url,
    { username: envStr(process.env, 'LT_ADMIN_USER', 'superadmin'), password: envRequired(process.env, 'LT_ADMIN_PASSWORD') },
    { name: BOT.SITE, description: 'A factory site: claims production orders and reports them made', roles: [{ role: ROLE.PRODUCTION, type: ROLE_TYPE.MEMBER }] },
    { attempts: 1 },
  );
  console.log(`CLOUD_URL=${url}`);
  console.log(`CLOUD_API_KEY=${issued.apiKey}`);
  console.log(`CLOUD_BOT_ID=${issued.botId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
