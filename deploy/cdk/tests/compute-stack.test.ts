import * as fs from 'fs';
import * as path from 'path';

import * as cdk from 'aws-cdk-lib';
import { Match } from 'aws-cdk-lib/assertions';

import { synthStacks, templateOf, TEST_SUBDOMAIN, TEST_ZONE } from './synth';

interface Container {
  Name: string;
  Environment?: Array<{ Name: string; Value: unknown }>;
  Secrets?: Array<{ Name: string }>;
}

describe('ComputeStack', () => {
  const template = templateOf(synthStacks().compute);

  const container = (name: string): Container =>
    Object.values(template.findResources('AWS::ECS::TaskDefinition'))
      .flatMap((taskDef) => taskDef.Properties.ContainerDefinitions as Container[])
      .find((entry) => entry.Name === name)!;
  const envOf = (name: string) => Object.fromEntries((container(name).Environment ?? []).map((e) => [e.Name, e.Value]));
  const secretsOf = (name: string) => (container(name).Secrets ?? []).map((s) => s.Name).sort();

  it('runs every task on ARM64', () => {
    const taskDefs = Object.values(template.findResources('AWS::ECS::TaskDefinition'));
    expect(taskDefs).toHaveLength(3);
    for (const taskDef of taskDefs) {
      expect(taskDef.Properties.RuntimePlatform).toEqual({ CpuArchitecture: 'ARM64', OperatingSystemFamily: 'LINUX' });
    }
  });

  it('runs one task per service with a public address', () => {
    const services = Object.values(template.findResources('AWS::ECS::Service'));
    expect(services.map((service) => service.Properties.ServiceName).sort()).toEqual(['api', 'nats', 'worker']);
    for (const service of services) {
      expect(service.Properties.DesiredCount).toBe(1);
      expect(service.Properties.NetworkConfiguration.AwsvpcConfiguration.AssignPublicIp).toBe('ENABLED');
    }
  });

  it('starts the new worker before stopping the old one', () => {
    template.hasResourceProperties('AWS::ECS::Service', {
      ServiceName: 'worker',
      DeploymentConfiguration: Match.objectLike({ MinimumHealthyPercent: 100, MaximumPercent: 200 }),
    });
  });

  it('keeps the API serving through a deploy and rolls back a failed one', () => {
    template.hasResourceProperties('AWS::ECS::Service', {
      ServiceName: 'api',
      DeploymentConfiguration: Match.objectLike({
        MinimumHealthyPercent: 100,
        MaximumPercent: 200,
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
      }),
    });
  });

  it('listens on 80 and 443 only', () => {
    const ports = Object.values(template.findResources('AWS::ElasticLoadBalancingV2::Listener'))
      .map((listener) => listener.Properties.Port)
      .sort();
    expect(ports).toEqual([443, 80]);
  });

  it('checks API health on /health', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      Port: 3000,
      HealthCheckPath: '/health',
    });
  });

  it('gives the API the database, NATS and Temporal settings', () => {
    expect(envOf('api')).toMatchObject({
      APP_ROLE: 'api',
      PORT: '3000',
      PGSSLMODE: 'no-verify',
      TEMPORAL_NAMESPACE: 'orders.abc12',
      NATS_URL: 'nats://nats.onpremcloud.local:4222',
      NATS_WS_TARGET: 'ws://nats.onpremcloud.local:9222',
      LT_STORAGE_BACKEND: 's3',
    });
    expect(secretsOf('api')).toEqual([
      'JWT_SECRET',
      'LT_ADMIN_PASSWORD',
      'NATS_TOKEN',
      'POSTGRES_HOST',
      'POSTGRES_PASSWORD',
      'POSTGRES_USER',
      'TEMPORAL_API_KEY',
    ]);
  });

  it('offers MCP sign-in at the public address, on the API only', () => {
    expect(envOf('api').LT_OAUTH_ISSUER).toBe(`https://${TEST_SUBDOMAIN}.${TEST_ZONE}`);
    expect(envOf('worker')).not.toHaveProperty('LT_OAUTH_ISSUER');
  });

  it('gives the worker the database, NATS and Temporal settings and no admin sign-in', () => {
    expect(envOf('worker')).toMatchObject({
      APP_ROLE: 'worker',
      PGSSLMODE: 'no-verify',
      POSTGRES_DB: envOf('api').POSTGRES_DB,
      NATS_URL: 'nats://nats.onpremcloud.local:4222',
      TEMPORAL_ADDRESS: 'us-west-2.aws.api.temporal.io:7233',
      LT_STORAGE_BACKEND: 's3',
    });
    for (const name of ['LT_URL', 'LT_ADMIN_USER', 'PORT', 'NATS_WS_TARGET']) expect(envOf('worker')).not.toHaveProperty(name);
    expect(secretsOf('worker')).toEqual([
      'JWT_SECRET',
      'NATS_TOKEN',
      'POSTGRES_HOST',
      'POSTGRES_PASSWORD',
      'POSTGRES_USER',
      'TEMPORAL_API_KEY',
    ]);
  });

  it('builds one ARM64 image from the production stage', () => {
    const { compute } = synthStacks();
    const directory = cdk.Stage.of(compute)!.synth().directory;
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, `${compute.stackName}.assets.json`), 'utf8'));
    const images = Object.values(manifest.dockerImages) as Array<{ source: Record<string, string> }>;
    expect(images).toHaveLength(1);
    expect(images[0].source).toMatchObject({ dockerBuildTarget: 'production', platform: 'linux/arm64' });
  });

  it('registers api and nats in the private namespace', () => {
    template.hasResourceProperties('AWS::ServiceDiscovery::PrivateDnsNamespace', { Name: 'onpremcloud.local' });
    const names = Object.values(template.findResources('AWS::ServiceDiscovery::Service'))
      .map((service) => service.Properties.Name)
      .sort();
    expect(names).toEqual(['api', 'nats']);
  });

  it('aliases the service name to the load balancer', () => {
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: `${TEST_SUBDOMAIN}.${TEST_ZONE}.`,
      Type: 'A',
    });
  });
});
