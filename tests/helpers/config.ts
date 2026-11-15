import { loadConfig, type AppConfig } from '../../src/modules/config';

/** A config built from explicit env, so a test names every value it depends on. */
export function testConfig(env: Record<string, string> = {}): AppConfig {
  return loadConfig({ TEMPORAL_ADDRESS: 'temporal.test:7233', LT_URL: 'http://lt.test', ...env });
}
