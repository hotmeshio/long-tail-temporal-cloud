#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import { defineStacks } from '../lib/stacks';

const app = new cdk.App();

defineStacks(app, {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
});
