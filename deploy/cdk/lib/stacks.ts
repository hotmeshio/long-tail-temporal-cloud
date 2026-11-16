import * as cdk from 'aws-cdk-lib';

import { ComputeStack } from './compute-stack';
import { loadConfig, type DeployConfig } from './config';
import { DataStack } from './data-stack';
import { DnsStack } from './dns-stack';
import { GithubOidcStack } from './github-oidc-stack';
import { NetworkStack } from './network-stack';

export interface DeployStacks {
  config: DeployConfig;
  network: NetworkStack;
  data: DataStack;
  dns: DnsStack;
  compute: ComputeStack;
  /** Present when githubOwner and githubRepo are given as context. */
  githubOidc?: GithubOidcStack;
}

export function defineStacks(app: cdk.App, env: cdk.Environment): DeployStacks {
  const config = loadConfig(app);

  // 1. Network
  const network = new NetworkStack(app, config.stackName('Network'), { env });

  // 2. Data
  const data = new DataStack(app, config.stackName('Data'), {
    env,
    vpc: network.vpc,
    dbSecurityGroup: network.dbSecurityGroup,
    config,
  });

  // 3. DNS and certificate
  const dns = new DnsStack(app, config.stackName('Dns'), { env, config });

  // 4. Compute
  const compute = new ComputeStack(app, config.stackName('Compute'), {
    env,
    vpc: network.vpc,
    albSecurityGroup: network.albSecurityGroup,
    appSecurityGroup: network.appSecurityGroup,
    workerSecurityGroup: network.workerSecurityGroup,
    natsSecurityGroup: network.natsSecurityGroup,
    dbSecret: data.dbSecret,
    bucket: data.bucket,
    jwtSecret: data.jwtSecret,
    adminPasswordSecret: data.adminPasswordSecret,
    natsTokenSecret: data.natsTokenSecret,
    temporalApiKeySecret: data.temporalApiKeySecret,
    certificate: dns.certificate,
    hostedZone: dns.hostedZone,
    config,
  });

  // 5. GitHub Actions deploy role
  const githubOwner = app.node.tryGetContext('githubOwner');
  const githubRepo = app.node.tryGetContext('githubRepo');
  const githubOidc = githubOwner && githubRepo
    ? new GithubOidcStack(app, config.stackName('GithubOidc'), { env, config, githubOwner, githubRepo })
    : undefined;

  return { config, network, data, dns, compute, githubOidc };
}
