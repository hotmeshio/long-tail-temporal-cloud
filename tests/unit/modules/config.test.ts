import { consoleUrl, envInt, envRequired, envStr, loadConfig } from '../../../src/modules/config';
import { APP_ROLE } from '../../../src/modules/constants';

describe('env readers', () => {
  it('falls back when a variable is unset or empty', () => {
    expect(envStr({ A: '' }, 'A', 'x')).toBe('x');
    expect(envInt({}, 'N', 7)).toBe(7);
  });

  it('reads set values', () => {
    expect(envStr({ A: 'b' }, 'A', 'x')).toBe('b');
    expect(envInt({ N: '42' }, 'N', 7)).toBe(42);
  });

  it('throws on a non-integer', () => {
    expect(() => envInt({ N: '4.2' }, 'N', 7)).toThrow('N must be an integer');
  });

  it('throws when a required variable is missing', () => {
    expect(() => envRequired({}, 'TEMPORAL_ADDRESS')).toThrow('TEMPORAL_ADDRESS is required');
  });
});

describe('loadConfig', () => {
  const base = { TEMPORAL_ADDRESS: 'temporal:7233' };

  it('requires a Temporal address', () => {
    expect(() => loadConfig({})).toThrow('TEMPORAL_ADDRESS is required');
  });

  it('runs both roles by default on the given port', () => {
    const config = loadConfig({ ...base, PORT: '3111' });
    expect(config.appRole).toBe(APP_ROLE.BOTH);
    expect(config.port).toBe(3111);
    expect(config.temporal.namespace).toBe('default');
    expect(config.nats).toBeUndefined();
  });

  it('rejects an unknown role', () => {
    expect(() => loadConfig({ ...base, APP_ROLE: 'scheduler' })).toThrow('APP_ROLE must be one of');
  });

  it('reads Temporal Cloud settings, and NATS', () => {
    const config = loadConfig({
      ...base, TEMPORAL_NAMESPACE: 'ns.acct', TEMPORAL_API_KEY: 'tk',
      NATS_URL: 'nats://nats:4222', NATS_TOKEN: 't', NATS_WS_TARGET: 'ws://nats:9222', DATABASE_URL: 'postgres://db',
    });
    expect(config.temporal).toMatchObject({ namespace: 'ns.acct', apiKey: 'tk' });
    expect(config.nats).toEqual({ url: 'nats://nats:4222', token: 't', wsProxy: 'ws://nats:9222' });
    expect(config.database.connectionString).toBe('postgres://db');
  });
});

describe('consoleUrl', () => {
  it('is undefined without a UI url', () => {
    expect(consoleUrl({ address: 'a', namespace: 'default' })).toBeUndefined();
  });

  it('builds the run link for the namespace', () => {
    expect(consoleUrl({ address: 'a', namespace: 'ns.acct', uiUrl: 'https://cloud.temporal.io/' }))
      .toBe('https://cloud.temporal.io/namespaces/ns.acct/workflows/{workflowId}');
  });
});
