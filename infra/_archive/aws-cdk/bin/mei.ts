#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DataStack } from '../lib/stacks/data-stack';

/**
 * Mei CDK app entry.
 *
 * The branch only needs to `cdk synth` cleanly. Real account IDs / regions are
 * NEVER baked in here — they come from CDK context or env vars at synth time.
 *
 * Usage:
 *   CDK_DEFAULT_ACCOUNT=111111111111 CDK_DEFAULT_REGION=ap-northeast-1 npx cdk synth
 *   # or
 *   npx cdk synth -c account=111111111111 -c region=ap-northeast-1
 *
 * Without creds, the placeholder values below let `cdk synth` succeed for CI
 * smoke tests; deployment will fail loudly because the placeholders are
 * obviously not real.
 */

const app = new cdk.App();

const account =
  app.node.tryGetContext('account') ??
  process.env.CDK_DEFAULT_ACCOUNT ??
  '000000000000'; // placeholder — never deploy with this

const region =
  app.node.tryGetContext('region') ??
  process.env.CDK_DEFAULT_REGION ??
  process.env.AWS_REGION ??
  'ap-northeast-1';

const env: cdk.Environment = { account, region };

// --- dev ---
new DataStack(app, 'MeiDataStack-dev', {
  env,
  stage: 'dev',
  // dev: tear-down friendly, MFA off, identity providers off until SSM is wired
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  enableMfa: false,
  appleConfigured: false,
  googleConfigured: false,
  description: 'Mei data stack (DDB single-table, S3 buckets, Cognito) — dev',
});

// --- prod (commented until ready to deploy) ---
// new DataStack(app, 'MeiDataStack-prod', {
//   env,
//   stage: 'prod',
//   removalPolicy: cdk.RemovalPolicy.RETAIN,
//   enableMfa: true,
//   appleConfigured: true,
//   googleConfigured: true,
//   description: 'Mei data stack (DDB single-table, S3 buckets, Cognito) — prod',
// });

app.synth();
