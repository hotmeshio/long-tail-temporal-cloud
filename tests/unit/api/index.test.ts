const { start, temporalProvider } = vi.hoisted(() => ({
  start: vi.fn(async (config: unknown) => ({ config })),
  temporalProvider: vi.fn((config: unknown) => ({ name: 'temporal', config })),
}));
vi.mock('@hotmeshio/long-tail', () => ({ start }));
vi.mock('@hotmeshio/long-tail-temporal/provider', () => ({ temporalProvider }));

import { startApi } from '../../../src/api';
import { ROLE, WORKFLOW } from '../../../src/modules/constants';
import { testConfig } from '../../helpers/config';

type Started = Record<string, any>;
const startedWith = () => start.mock.calls.at(-1)![0] as Started;

beforeEach(() => { start.mockClear(); temporalProvider.mockClear(); });

describe('startApi', () => {
  it('starts Long Tail on Temporal with the roles and invocable workflows', async () => {
    await startApi(testConfig({ PORT: '3111', TEMPORAL_NAMESPACE: 'ns.acct', TEMPORAL_API_KEY: 'tk', TEMPORAL_UI_URL: 'https://cloud.temporal.io' }));
    expect(temporalProvider).toHaveBeenCalledWith({ address: 'temporal.test:7233', namespace: 'ns.acct', apiKey: 'tk' });
    const config = startedWith();
    expect(config.server).toEqual({ port: 3111 });
    expect(config.durable.consoleUrl).toBe('https://cloud.temporal.io/namespaces/ns.acct/workflows/{workflowId}');
    expect(config.roles.map((r: Started) => r.role)).toContain(ROLE.FABRICATION);
    expect(config.workers.map((w: Started) => w.workflow)).toContain(WORKFLOW.FABRICATION_ORDER_REQUEST);
  });

  it('uses a connection string when one is set, else the Postgres fields', async () => {
    await startApi(testConfig({ DATABASE_URL: 'postgres://db' }));
    expect(startedWith().database).toEqual({ connectionString: 'postgres://db' });
    await startApi(testConfig({ POSTGRES_HOST: 'pg', POSTGRES_DB: 'lt' }));
    expect(startedWith().database).toMatchObject({ host: 'pg', database: 'lt', port: 5432 });
  });

  it('seeds the admin and sets the signing secret only when given', async () => {
    await startApi(testConfig());
    expect(startedWith()).not.toHaveProperty('seed');
    expect(startedWith()).not.toHaveProperty('auth');
    await startApi(testConfig({ LT_ADMIN_PASSWORD: 'pw', JWT_SECRET: 's' }));
    expect(startedWith().seed.admin).toMatchObject({ externalId: 'superadmin', password: 'pw' });
    expect(startedWith().auth).toEqual({ secret: 's' });
  });

  it('wires NATS events when a url is set', async () => {
    await startApi(testConfig());
    expect(startedWith()).not.toHaveProperty('events');
    await startApi(testConfig({ NATS_URL: 'nats://nats:4222', NATS_TOKEN: 't' }));
    expect(startedWith().events.nats).toMatchObject({ url: 'nats://nats:4222', token: 't' });
  });
});
