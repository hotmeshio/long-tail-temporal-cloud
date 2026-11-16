import { CONTAINER_PORT, loadConfig } from '../lib/config';
import { createApp, TEST_SUBDOMAIN, TEST_ZONE } from './synth';

const REQUIRED_ENV = ['LT_HOSTED_ZONE_DOMAIN', 'LT_SUBDOMAIN', 'TEMPORAL_ADDRESS', 'TEMPORAL_NAMESPACE'];

describe('loadConfig', () => {
  beforeEach(() => {
    for (const name of REQUIRED_ENV) vi.stubEnv(name, '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('derives names from the project name', () => {
    const config = loadConfig(createApp());
    expect(config.projectName).toBe('OnPremCloud');
    expect(config.projectSlug).toBe('onpremcloud');
    expect(config.stackName('Data')).toBe('OnPremCloud-Data');
    expect(config.secretName('NatsToken')).toBe('OnPremCloud/NatsToken');
    expect(config.logGroup('api')).toBe('/ecs/onpremcloud/api');
    expect(config.bucketName('111111111111', 'us-west-2')).toBe('onpremcloud-assets-111111111111-us-west-2');
  });

  it('joins the subdomain and the hosted zone', () => {
    expect(loadConfig(createApp()).domainName).toBe(`${TEST_SUBDOMAIN}.${TEST_ZONE}`);
  });

  it('addresses the API and NATS through the private namespace', () => {
    const config = loadConfig(createApp());
    expect(config.apiUrl).toBe(`http://api.onpremcloud.local:${CONTAINER_PORT}`);
    expect(config.natsUrl).toBe('nats://nats.onpremcloud.local:4222');
    expect(config.natsWsUrl).toBe('ws://nats.onpremcloud.local:9222');
  });

  it('takes a project name override', () => {
    const config = loadConfig(createApp({ projectName: 'Fab Cloud' }));
    expect(config.projectSlug).toBe('fab-cloud');
    expect(config.deployRoleName).toBe('Fab Cloud-GithubActionsDeployRole');
  });

  it('reads required values from the environment when context is absent', () => {
    vi.stubEnv('TEMPORAL_NAMESPACE', 'from-env.abc12');
    const config = loadConfig(createApp({ temporalNamespace: undefined }));
    expect(config.temporalNamespace).toBe('from-env.abc12');
  });

  it.each([
    ['hostedZoneDomain', 'LT_HOSTED_ZONE_DOMAIN'],
    ['subdomain', 'LT_SUBDOMAIN'],
    ['temporalAddress', 'TEMPORAL_ADDRESS'],
    ['temporalNamespace', 'TEMPORAL_NAMESPACE'],
  ])('throws when %s is missing, naming %s', (contextKey, envKey) => {
    expect(() => loadConfig(createApp({ [contextKey]: undefined }))).toThrow(new RegExp(`${contextKey}.*${envKey}`));
  });
});
