import * as cdk from 'aws-cdk-lib';

export const CONTAINER_PORT = 3000;
export const NATS_PORT = 4222;
export const NATS_WS_PORT = 9222;
export const POSTGRES_PORT = 5432;
export const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com';

/**
 * Deployment settings. The domain and the Temporal namespace are required and
 * come from CDK context or the environment:
 *   LT_HOSTED_ZONE_DOMAIN=example.com LT_SUBDOMAIN=cloud \
 *   TEMPORAL_ADDRESS=us-west-2.aws.api.temporal.io:7233 TEMPORAL_NAMESPACE=name.account \
 *   npx cdk deploy --all
 * The rest have defaults and take the same context overrides.
 */
export function loadConfig(app: cdk.App) {
  /** Prefix for stack names, secrets and the deploy role. */
  const projectName: string = app.node.tryGetContext('projectName') || 'OnPremCloud';

  /** Lowercase form, for names AWS requires in lowercase. */
  const projectSlug: string = app.node.tryGetContext('projectSlug') || projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');

  /** The Route 53 hosted zone the account owns. */
  const hostedZoneDomain = required(app, 'hostedZoneDomain', 'LT_HOSTED_ZONE_DOMAIN');

  /** Record name under the hosted zone. */
  const subdomain = required(app, 'subdomain', 'LT_SUBDOMAIN');

  /** The namespace's regional gRPC address. */
  const temporalAddress = required(app, 'temporalAddress', 'TEMPORAL_ADDRESS');

  /** The namespace id: name.account. */
  const temporalNamespace = required(app, 'temporalNamespace', 'TEMPORAL_NAMESPACE');

  const temporalUiUrl: string = app.node.tryGetContext('temporalUiUrl') || process.env.TEMPORAL_UI_URL || 'https://cloud.temporal.io';

  const environment: string = app.node.tryGetContext('environment') || 'production';
  const dbName: string = app.node.tryGetContext('dbName') || projectSlug;
  const dbUsername: string = app.node.tryGetContext('dbUsername') || projectSlug;
  const adminUser: string = app.node.tryGetContext('adminUser') || 'superadmin';

  /** POST /api/auth/login attempts allowed per client IP per window. */
  const loginRateLimit = Number(app.node.tryGetContext('loginRateLimit') ?? 30);

  /** Window the login limit is counted over: 60, 120, 300 or 600 seconds. */
  const loginRateWindowSeconds = Number(app.node.tryGetContext('loginRateWindowSeconds') ?? 300);

  /** Cloud Map private DNS namespace. */
  const serviceDiscoveryNamespace = `${projectSlug}.local`;

  return {
    projectName,
    projectSlug,
    hostedZoneDomain,
    subdomain,
    domainName: `${subdomain}.${hostedZoneDomain}`,
    temporalAddress,
    temporalNamespace,
    temporalUiUrl,
    environment,
    dbName,
    dbUsername,
    adminUser,
    loginRateLimit,
    loginRateWindowSeconds,
    serviceDiscoveryNamespace,

    stackName: (suffix: string) => `${projectName}-${suffix}`,
    logGroup: (service: string) => `/ecs/${projectSlug}/${service}`,
    secretName: (name: string) => `${projectName}/${name}`,
    bucketName: (account: string, region: string) => `${projectSlug}-assets-${account}-${region}`,

    /** Where the worker reaches the API, inside the VPC. */
    apiUrl: `http://api.${serviceDiscoveryNamespace}:${CONTAINER_PORT}`,
    natsUrl: `nats://nats.${serviceDiscoveryNamespace}:${NATS_PORT}`,
    natsWsUrl: `ws://nats.${serviceDiscoveryNamespace}:${NATS_WS_PORT}`,
    deployRoleName: `${projectName}-GithubActionsDeployRole`,
  };
}

export type DeployConfig = ReturnType<typeof loadConfig>;

/** A value from CDK context or the environment; throws when neither is set. */
function required(app: cdk.App, contextKey: string, envKey: string): string {
  const value = app.node.tryGetContext(contextKey) || process.env[envKey];
  if (!value) throw new Error(`Missing ${contextKey}: pass -c ${contextKey}=... or set ${envKey}`);
  return value;
}
