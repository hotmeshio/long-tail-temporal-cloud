const { start, temporalProvider } = vi.hoisted(() => ({
  start: vi.fn(async (config: unknown) => ({ config })),
  temporalProvider: vi.fn((config: unknown) => ({ name: 'temporal', config })),
}));
vi.mock('@hotmeshio/long-tail', () => ({ start }));
vi.mock('@hotmeshio/long-tail-temporal/provider', () => ({ temporalProvider }));

import { startLongTail } from '../../../src/api';
import { APP_ROLE, ROLE, WORKFLOW } from '../../../src/modules/constants';
import { testConfig } from '../../helpers/config';

type Started = Record<string, any>;
const startedWith = () => start.mock.calls.at(-1)![0] as Started;

beforeEach(() => { start.mockClear(); temporalProvider.mockClear(); });

describe('startLongTail', () => {
  it('starts Long Tail on Temporal with the roles and invocable workflows', async () => {
    await startLongTail(testConfig({ PORT: '3111', TEMPORAL_NAMESPACE: 'ns.acct', TEMPORAL_API_KEY: 'tk', TEMPORAL_UI_URL: 'https://cloud.temporal.io' }));
    expect(temporalProvider).toHaveBeenCalledWith({ address: 'temporal.test:7233', namespace: 'ns.acct', apiKey: 'tk' });
    const config = startedWith();
    expect(config.server).toEqual({ port: 3111 });
    expect(config.durable.consoleUrl).toBe('https://cloud.temporal.io/namespaces/ns.acct/workflows/{workflowId}');
    expect(config.roles.map((r: Started) => r.role)).toContain(ROLE.FABRICATION);
    expect(config.workers.map((w: Started) => w.workflow)).toContain(WORKFLOW.FABRICATION_ORDER_REQUEST);
  });

  it('serves HTTP for the api role and for both', async () => {
    await startLongTail(testConfig({ APP_ROLE: APP_ROLE.API }));
    expect(startedWith().server).toEqual({ port: 3000 });
    await startLongTail(testConfig({ APP_ROLE: APP_ROLE.BOTH }));
    expect(startedWith().server).toEqual({ port: 3000 });
  });

  it('runs without the HTTP server for the worker role, on the same database and engine', async () => {
    await startLongTail(testConfig({ APP_ROLE: APP_ROLE.WORKER, POSTGRES_HOST: 'pg' }));
    const config = startedWith();
    expect(config.server).toEqual({ enabled: false });
    expect(config.database).toMatchObject({ host: 'pg' });
    expect(config.durable.provider).toMatchObject({ name: 'temporal' });
    expect(config.roles.map((r: Started) => r.role)).toContain(ROLE.FABRICATION);
  });

  it('uses a connection string when one is set, else the Postgres fields', async () => {
    await startLongTail(testConfig({ DATABASE_URL: 'postgres://db' }));
    expect(startedWith().database).toEqual({ connectionString: 'postgres://db' });
    await startLongTail(testConfig({ POSTGRES_HOST: 'pg', POSTGRES_DB: 'lt' }));
    expect(startedWith().database).toMatchObject({ host: 'pg', database: 'lt', port: 5432 });
  });

  it('seeds the admin and sets the signing secret only when given', async () => {
    await startLongTail(testConfig());
    expect(startedWith()).not.toHaveProperty('seed');
    expect(startedWith()).not.toHaveProperty('auth');
    await startLongTail(testConfig({ LT_ADMIN_PASSWORD: 'pw', JWT_SECRET: 's' }));
    expect(startedWith().seed.admin).toMatchObject({ externalId: 'superadmin', password: 'pw' });
    expect(startedWith().auth).toEqual({ secret: 's' });
  });

  it('wires NATS events when a url is set', async () => {
    await startLongTail(testConfig());
    expect(startedWith()).not.toHaveProperty('events');
    await startLongTail(testConfig({ NATS_URL: 'nats://nats:4222', NATS_TOKEN: 't' }));
    expect(startedWith().events.nats).toMatchObject({ url: 'nats://nats:4222', token: 't' });
  });
});
