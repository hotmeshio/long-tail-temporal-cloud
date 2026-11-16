import { Match } from 'aws-cdk-lib/assertions';

import { synthStacks, templateOf } from './synth';

describe('DataStack', () => {
  const template = templateOf(synthStacks().data);

  it('runs one single-AZ Postgres 16 instance on db.t4g.micro', () => {
    template.resourceCountIs('AWS::RDS::DBInstance', 1);
    template.resourceCountIs('AWS::RDS::DBCluster', 0);
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      EngineVersion: Match.stringLikeRegexp('^16'),
      DBInstanceClass: 'db.t4g.micro',
      MultiAZ: false,
      StorageEncrypted: true,
      PubliclyAccessible: false,
      BackupRetentionPeriod: 7,
    });
  });

  it('snapshots the database when the stack is deleted', () => {
    template.hasResource('AWS::RDS::DBInstance', { DeletionPolicy: 'Snapshot' });
  });

  it('keeps the assets bucket private, encrypted and versioned', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'onpremcloud-assets-111111111111-us-west-2',
      VersioningConfiguration: { Status: 'Enabled' },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('names each secret under the project', () => {
    const names = Object.values(template.findResources('AWS::SecretsManager::Secret'))
      .map((secret) => secret.Properties.Name)
      .sort();
    expect(names).toEqual([
      'OnPremCloud/AdminPassword',
      'OnPremCloud/Database',
      'OnPremCloud/JwtSigningKey',
      'OnPremCloud/NatsToken',
      'OnPremCloud/TemporalApiKey',
    ]);
  });

  it('creates the Temporal key secret with a placeholder value', () => {
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'OnPremCloud/TemporalApiKey',
      SecretString: 'placeholder',
    });
  });
});
