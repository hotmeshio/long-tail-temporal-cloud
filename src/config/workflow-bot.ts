import { api, createClient } from '@hotmeshio/long-tail';
import type { LongTailClient } from '@hotmeshio/long-tail-temporal/worker';

import { BOT, ROLE, ROLE_TYPE } from '../modules/constants';

/** The account the workflows open and close their waits as. It is a member of every role an order waits in. */
export const WORKFLOW_BOT = {
  name: BOT.WORKFLOWS,
  description: 'Opens and closes waits for the Temporal workflows',
  roles: Object.values(ROLE).map((role) => ({ role, type: ROLE_TYPE.MEMBER })),
};

interface Bot { id: string; external_id: string }

function ok<T>(what: string, result: { status: number; data?: unknown; error?: string }): T {
  if (result.status >= 400) throw new Error(`${what}: ${result.error ?? result.status}`);
  return result.data as T;
}

async function findOrCreateBot(): Promise<Bot> {
  const listed = ok<{ bots?: Bot[] } | Bot[]>('list bots', await api.botAccounts.listBots({ search: WORKFLOW_BOT.name, limit: 50 }));
  const bots = Array.isArray(listed) ? listed : listed.bots ?? [];
  const existing = bots.find((bot) => bot.external_id === WORKFLOW_BOT.name);
  if (existing) {
    for (const role of WORKFLOW_BOT.roles) ok('add bot role', await api.botAccounts.addBotRole({ id: existing.id, ...role }));
    return existing;
  }
  return ok<Bot>('create bot', await api.botAccounts.createBot(WORKFLOW_BOT));
}

/** Long Tail in this process, called as the workflow bot. */
export async function workflowConnection(): Promise<{ client: LongTailClient }> {
  const bot = await findOrCreateBot();
  return { client: createClient({ auth: { userId: bot.id } }) };
}
