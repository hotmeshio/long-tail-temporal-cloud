import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import { defineStacks, type DeployStacks } from '../lib/stacks';

export const TEST_ENV = { account: '111111111111', region: 'us-west-2' };
export const TEST_ZONE = 'example.com';
export const TEST_SUBDOMAIN = 'cloud';
export const TEST_GITHUB = { owner: 'acme', repo: 'cloud' };

const BASE_CONTEXT = {
  hostedZoneDomain: TEST_ZONE,
  subdomain: TEST_SUBDOMAIN,
  temporalAddress: 'us-west-2.aws.api.temporal.io:7233',
  temporalNamespace: 'orders.abc12',
  // Lookup answers, so synthesis makes no AWS call.
  [`availability-zones:account=${TEST_ENV.account}:region=${TEST_ENV.region}`]: ['us-west-2a', 'us-west-2b', 'us-west-2c'],
  [`hosted-zone:account=${TEST_ENV.account}:domainName=${TEST_ZONE}:region=${TEST_ENV.region}`]: {
    Id: '/hostedzone/Z0000000TEST',
    Name: `${TEST_ZONE}.`,
  },
  // The image asset is fingerprinted, never built, during synthesis.
  'aws:cdk:bundling-stacks': [],
};

export function createApp(context: Record<string, unknown> = {}): cdk.App {
  return new cdk.App({ context: { ...BASE_CONTEXT, ...context } });
}

let cached: DeployStacks | undefined;

/** The full stack set, built once per test run. */
export function synthStacks(): DeployStacks {
  cached ??= defineStacks(
    createApp({ githubOwner: TEST_GITHUB.owner, githubRepo: TEST_GITHUB.repo }),
    TEST_ENV,
  );
  return cached;
}

export function templateOf(stack: cdk.Stack): Template {
  return Template.fromStack(stack);
}
