import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

import type { DeployConfig } from './config';

/** Stored until the real Temporal Cloud key is written with put-secret-value. */
export const SECRET_PLACEHOLDER = 'placeholder';

export interface DataStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dbSecurityGroup: ec2.SecurityGroup;
  config: DeployConfig;
}

export class DataStack extends cdk.Stack {
  public readonly database: rds.DatabaseInstance;
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly bucket: s3.Bucket;
  public readonly jwtSecret: secretsmanager.Secret;
  public readonly adminPasswordSecret: secretsmanager.Secret;
  public readonly natsTokenSecret: secretsmanager.Secret;
  public readonly temporalApiKeySecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { vpc, dbSecurityGroup, config } = props;

    // --- Postgres ---

    this.database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      databaseName: config.dbName,
      credentials: rds.Credentials.fromGeneratedSecret(config.dbUsername, {
        secretName: config.secretName('Database'),
      }),
      backupRetention: cdk.Duration.days(7),
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });
    this.dbSecret = this.database.secret!;

    // --- Fabrication assets ---

    this.bucket = new s3.Bucket(this, 'AssetsBucket', {
      bucketName: config.bucketName(this.account, this.region),
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ noncurrentVersionExpiration: cdk.Duration.days(30) }],
    });

    // --- Secrets ---

    this.jwtSecret = new secretsmanager.Secret(this, 'JwtSigningKey', {
      secretName: config.secretName('JwtSigningKey'),
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });

    this.adminPasswordSecret = new secretsmanager.Secret(this, 'AdminPassword', {
      secretName: config.secretName('AdminPassword'),
      generateSecretString: { passwordLength: 32, excludePunctuation: true },
    });

    this.natsTokenSecret = new secretsmanager.Secret(this, 'NatsToken', {
      secretName: config.secretName('NatsToken'),
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    });

    this.temporalApiKeySecret = new secretsmanager.Secret(this, 'TemporalApiKey', {
      secretName: config.secretName('TemporalApiKey'),
      secretStringValue: cdk.SecretValue.unsafePlainText(SECRET_PLACEHOLDER),
    });

    // --- Outputs ---

    new cdk.CfnOutput(this, 'DatabaseEndpoint', { value: this.database.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, 'BucketName', { value: this.bucket.bucketName });
    new cdk.CfnOutput(this, 'TemporalApiKeySecretName', { value: this.temporalApiKeySecret.secretName });
    new cdk.CfnOutput(this, 'AdminPasswordSecretName', { value: this.adminPasswordSecret.secretName });
  }
}
