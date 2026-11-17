const { connect, create, workflowConnection } = vi.hoisted(() => ({
  connect: vi.fn(async (options: unknown) => ({ options })),
  create: vi.fn(async (options: unknown) => ({ options })),
  workflowConnection: vi.fn(),
}));
vi.mock('@temporalio/worker', () => ({ NativeConnection: { connect }, Worker: { create } }));
vi.mock('@hotmeshio/long-tail-temporal/worker', () => ({
  longTailActivities: (c: unknown) => ({ ltOpen: c }),
  longTailTools: (c: unknown) => ({ ltTool: c }),
}));
vi.mock('@hotmeshio/long-tail', () => ({ getStorageBackend: vi.fn() }));
vi.mock('../../../src/config/workflow-bot', () => ({ workflowConnection }));

import { APP_ROLE, TASK_QUEUE } from '../../../src/modules/constants';
import { createWorker } from '../../../src/worker';
import { testConfig } from '../../helpers/config';

type Options = Record<string, any>;

const IN_PROCESS = { client: { name: 'in-process' } };

beforeEach(() => {
  vi.clearAllMocks();
  workflowConnection.mockResolvedValue(IN_PROCESS);
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

  it('calls Long Tail in process for a worker on its own, with no admin password', async () => {
    await createWorker(testConfig({ APP_ROLE: APP_ROLE.WORKER }));
    const options = create.mock.calls[0][0] as Options;
    expect(options.activities.ltOpen).toBe(IN_PROCESS);
    expect(options.activities.ltTool).toBe(IN_PROCESS);
  });

  it('does not connect to Temporal when Long Tail cannot be reached', async () => {
    workflowConnection.mockRejectedValue(new Error('list bots: database is down'));
    await expect(createWorker(testConfig())).rejects.toThrow('database is down');
    expect(connect).not.toHaveBeenCalled();
  });
});
