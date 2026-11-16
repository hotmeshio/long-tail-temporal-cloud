const { connect, create, issueBotKey } = vi.hoisted(() => ({
  connect: vi.fn(async (options: unknown) => ({ options })),
  create: vi.fn(async (options: unknown) => ({ options })),
  issueBotKey: vi.fn(),
}));
vi.mock('@temporalio/worker', () => ({ NativeConnection: { connect }, Worker: { create } }));
vi.mock('@hotmeshio/long-tail-temporal/worker', () => ({
  longTailActivities: (c: unknown) => ({ ltOpen: c }),
  longTailTools: (c: unknown) => ({ ltTool: c }),
}));
vi.mock('@hotmeshio/long-tail', () => ({ getStorageBackend: vi.fn() }));
vi.mock('../../../src/services/bot-key', () => ({ issueBotKey }));

import { BOT, ROLE, TASK_QUEUE } from '../../../src/modules/constants';
import { createWorker, resolveApiKey } from '../../../src/worker';
import { testConfig } from '../../helpers/config';

type Options = Record<string, any>;

beforeEach(() => { connect.mockClear(); create.mockClear(); issueBotKey.mockReset(); });

describe('resolveApiKey', () => {
  it('uses LT_API_KEY when set', async () => {
    expect(await resolveApiKey(testConfig({ LT_API_KEY: 'lt_bot_set' }))).toBe('lt_bot_set');
    expect(issueBotKey).not.toHaveBeenCalled();
  });

  it('mints a key for the workflow bot by admin sign-in', async () => {
    issueBotKey.mockResolvedValue({ botId: 'b1', apiKey: 'lt_bot_minted' });
    expect(await resolveApiKey(testConfig({ LT_ADMIN_PASSWORD: 'pw' }))).toBe('lt_bot_minted');
    const [url, admin, bot] = issueBotKey.mock.calls[0];
    expect(url).toBe('http://lt.test');
    expect(admin).toEqual({ username: 'superadmin', password: 'pw' });
    expect(bot).toMatchObject({ name: BOT.WORKFLOWS, roles: [{ role: ROLE.FABRICATION, type: 'member' }] });
  });

  it('throws when there is neither a key nor an admin password', async () => {
    await expect(resolveApiKey(testConfig())).rejects.toThrow('Set LT_API_KEY');
  });
});

describe('createWorker', () => {
  it('connects without TLS to a self-hosted Temporal', async () => {
    await createWorker(testConfig({ LT_API_KEY: 'k' }));
    expect(connect).toHaveBeenCalledWith({ address: 'temporal.test:7233' });
  });

  it('connects to Temporal Cloud with the API key over TLS', async () => {
    await createWorker(testConfig({ LT_API_KEY: 'k', TEMPORAL_API_KEY: 'tk', TEMPORAL_NAMESPACE: 'ns.acct' }));
    expect(connect).toHaveBeenCalledWith({ address: 'temporal.test:7233', apiKey: 'tk', tls: true });
    expect((create.mock.calls[0][0] as Options).namespace).toBe('ns.acct');
  });

  it('registers the order activities beside the Long Tail activities on the task queue', async () => {
    await createWorker(testConfig({ LT_API_KEY: 'k' }));
    const options = create.mock.calls[0][0] as Options;
    expect(options.taskQueue).toBe(TASK_QUEUE);
    expect(options.workflowsPath).toMatch(/workflows/);
    expect(options.activities.stageAssets).toBeTypeOf('function');
    expect(options.activities.ltOpen).toEqual({ url: 'http://lt.test', apiKey: 'k' });
    expect(options.activities.ltTool).toEqual({ url: 'http://lt.test', apiKey: 'k' });
  });

  it('does not connect when no key can be had', async () => {
    await expect(createWorker(testConfig())).rejects.toThrow('Set LT_API_KEY');
    expect(connect).not.toHaveBeenCalled();
  });
});
