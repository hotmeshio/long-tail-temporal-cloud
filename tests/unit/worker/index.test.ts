const { connect, create, issueBotKey, workflowConnection } = vi.hoisted(() => ({
  connect: vi.fn(async (options: unknown) => ({ options })),
  create: vi.fn(async (options: unknown) => ({ options })),
  issueBotKey: vi.fn(),
  workflowConnection: vi.fn(),
}));
vi.mock('@temporalio/worker', () => ({ NativeConnection: { connect }, Worker: { create } }));
vi.mock('@hotmeshio/long-tail-temporal/worker', () => ({
  longTailActivities: (c: unknown) => ({ ltOpen: c }),
  longTailTools: (c: unknown) => ({ ltTool: c }),
}));
vi.mock('@hotmeshio/long-tail', () => ({ getStorageBackend: vi.fn() }));
vi.mock('../../../src/services/bot-key', () => ({ issueBotKey }));
vi.mock('../../../src/config/workflow-bot', () => ({ WORKFLOW_BOT: { name: 'temporal-workflows' }, workflowConnection }));

import { APP_ROLE, TASK_QUEUE } from '../../../src/modules/constants';
import { connectLongTail, createWorker } from '../../../src/worker';
import { testConfig } from '../../helpers/config';

type Options = Record<string, any>;

const IN_PROCESS = { client: { name: 'in-process' } };
const WORKER = { APP_ROLE: APP_ROLE.WORKER, LT_ADMIN_PASSWORD: 'pw' };

beforeEach(() => {
  vi.clearAllMocks();
  workflowConnection.mockResolvedValue(IN_PROCESS);
  issueBotKey.mockResolvedValue({ botId: 'b1', apiKey: 'lt_bot_issued' });
});

describe('connectLongTail', () => {
  it('calls Long Tail in process when the API runs beside the worker', async () => {
    expect(await connectLongTail(testConfig({ LT_ADMIN_PASSWORD: 'pw' }))).toBe(IN_PROCESS);
    expect(issueBotKey).not.toHaveBeenCalled();
  });

  it('issues a key for the workflow bot when the worker runs on its own', async () => {
    expect(await connectLongTail(testConfig(WORKER))).toEqual({ url: 'http://lt.test', apiKey: 'lt_bot_issued' });
    expect(issueBotKey).toHaveBeenCalledWith('http://lt.test', { username: 'superadmin', password: 'pw' }, { name: 'temporal-workflows' });
    expect(workflowConnection).not.toHaveBeenCalled();
  });

  it('throws when a worker on its own has no admin password', async () => {
    await expect(connectLongTail(testConfig({ APP_ROLE: APP_ROLE.WORKER }))).rejects.toThrow('LT_ADMIN_PASSWORD is required');
    expect(issueBotKey).not.toHaveBeenCalled();
  });
});

describe('createWorker', () => {
  it('connects without TLS to a self-hosted Temporal', async () => {
    await createWorker(testConfig());
    expect(connect).toHaveBeenCalledWith({ address: 'temporal.test:7233' });
  });

  it('connects to Temporal Cloud with the API key over TLS', async () => {
    await createWorker(testConfig({ TEMPORAL_API_KEY: 'tk', TEMPORAL_NAMESPACE: 'ns.acct' }));
    expect(connect).toHaveBeenCalledWith({ address: 'temporal.test:7233', apiKey: 'tk', tls: true });
    expect((create.mock.calls[0][0] as Options).namespace).toBe('ns.acct');
  });

  it('registers the order activities beside the in-process Long Tail activities', async () => {
    await createWorker(testConfig());
    const options = create.mock.calls[0][0] as Options;
    expect(options.taskQueue).toBe(TASK_QUEUE);
    expect(options.workflowsPath).toMatch(/workflows/);
    expect(options.activities.stageAssets).toBeTypeOf('function');
    expect(options.activities.ltOpen).toBe(IN_PROCESS);
    expect(options.activities.ltTool).toBe(IN_PROCESS);
  });

  it('registers the Long Tail activities over HTTP for a worker on its own', async () => {
    await createWorker(testConfig(WORKER));
    const options = create.mock.calls[0][0] as Options;
    expect(options.activities.ltOpen).toEqual({ url: 'http://lt.test', apiKey: 'lt_bot_issued' });
    expect(options.activities.ltTool).toEqual({ url: 'http://lt.test', apiKey: 'lt_bot_issued' });
  });

  it('does not connect to Temporal when Long Tail cannot be reached', async () => {
    workflowConnection.mockRejectedValue(new Error('list bots: database is down'));
    await expect(createWorker(testConfig())).rejects.toThrow('database is down');
    expect(connect).not.toHaveBeenCalled();
  });
});
