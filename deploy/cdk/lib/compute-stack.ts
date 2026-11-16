import * as path from 'path';

import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import { Construct } from 'constructs';

import { CONTAINER_PORT, NATS_PORT, NATS_WS_PORT, POSTGRES_PORT, type DeployConfig } from './config';
import { LoginWaf } from './login-waf';

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const IMAGE_TARGET = 'production';
/** Left out of the build context, so only app changes produce a new image. */
const IMAGE_EXCLUDE = ['deploy', 'node_modules', 'build', 'tests', 'scripts', 'docker', 'docker-compose.yml', 'vitest.config.mts', '.git', '.github', '.env', '*.md'];
const HEALTH_PATH = '/health';
const NATS_MONITOR_PORT = 8222;

export interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  albSecurityGroup: ec2.SecurityGroup;
  appSecurityGroup: ec2.SecurityGroup;
  workerSecurityGroup: ec2.SecurityGroup;
  natsSecurityGroup: ec2.SecurityGroup;
  dbSecret: secretsmanager.ISecret;
  bucket: s3.Bucket;
  jwtSecret: secretsmanager.Secret;
  adminPasswordSecret: secretsmanager.Secret;
  natsTokenSecret: secretsmanager.Secret;
  temporalApiKeySecret: secretsmanager.Secret;
  certificate: acm.Certificate;
  hostedZone: route53.IHostedZone;
  config: DeployConfig;
}

/**
 * One image, three Fargate services: the API and dashboard behind the load
 * balancer, the Temporal worker, and NATS. Tasks run on ARM64 in the public
 * subnets with public addresses.
 */
export class ComputeStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  private readonly config: DeployConfig;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { vpc, bucket, config } = props;
    this.config = config;

    const image = ecs.ContainerImage.fromAsset(REPO_ROOT, {
      target: IMAGE_TARGET,
      platform: Platform.LINUX_ARM64,
      exclude: IMAGE_EXCLUDE,
    });

    const runtimePlatform = {
      cpuArchitecture: ecs.CpuArchitecture.ARM64,
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
    };
    const placement = {
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      assignPublicIp: true,
    };

    const temporalEnv = {
      NODE_ENV: 'production',
      TEMPORAL_ADDRESS: config.temporalAddress,
      TEMPORAL_NAMESPACE: config.temporalNamespace,
      TEMPORAL_UI_URL: config.temporalUiUrl,
      LT_ADMIN_USER: config.adminUser,
      LT_STORAGE_BACKEND: 's3',
      LT_S3_BUCKET: bucket.bucketName,
      LT_S3_REGION: this.region,
    };
    const temporalSecrets = {
      TEMPORAL_API_KEY: ecs.Secret.fromSecretsManager(props.temporalApiKeySecret),
      LT_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(props.adminPasswordSecret),
    };

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: config.projectSlug,
      defaultCloudMapNamespace: {
        name: config.serviceDiscoveryNamespace,
        type: servicediscovery.NamespaceType.DNS_PRIVATE,
        vpc,
      },
    });

    // --- NATS: dashboard events, reached by browsers through the API's /nats-ws proxy ---

    const natsTaskDef = new ecs.FargateTaskDefinition(this, 'NatsTaskDef', {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform,
    });

    natsTaskDef.addContainer('nats', {
      image: ecs.ContainerImage.fromRegistry('nats:2-alpine'),
      entryPoint: ['sh', '-c'],
      command: [
        `printf 'port: ${NATS_PORT}\\nhttp_port: ${NATS_MONITOR_PORT}\\nauthorization { token: %s }\\nwebsocket { port: ${NATS_WS_PORT}\\n  no_tls: true\\n}\\n' "$NATS_TOKEN" > /tmp/nats.conf && exec nats-server -c /tmp/nats.conf`,
      ],
      portMappings: [{ containerPort: NATS_PORT }, { containerPort: NATS_WS_PORT }],
      secrets: { NATS_TOKEN: ecs.Secret.fromSecretsManager(props.natsTokenSecret) },
      logging: ecs.LogDrivers.awsLogs({ logGroup: this.createLogGroup('nats', logs.RetentionDays.ONE_WEEK), streamPrefix: 'nats' }),
    });

    new ecs.FargateService(this, 'NatsService', {
      cluster,
      taskDefinition: natsTaskDef,
      desiredCount: 1,
      securityGroups: [props.natsSecurityGroup],
      ...placement,
      serviceName: 'nats',
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      cloudMapOptions: { name: 'nats', dnsRecordType: servicediscovery.DnsRecordType.A },
    });

    // --- Load balancer ---

    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      securityGroup: props.albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      idleTimeout: cdk.Duration.seconds(60),
    });

    new LoginWaf(this, 'LoginWaf', {
      loadBalancerArn: this.alb.loadBalancerArn,
      name: config.projectSlug,
      loginRateLimit: config.loginRateLimit,
      loginRateWindowSeconds: config.loginRateWindowSeconds,
    });

    this.alb.addListener('HttpRedirect', {
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({ protocol: 'HTTPS', port: '443' }),
    });

    const httpsListener = this.alb.addListener('HttpsListener', {
      port: 443,
      certificates: [props.certificate],
      defaultAction: elbv2.ListenerAction.fixedResponse(404, { contentType: 'text/plain', messageBody: 'Not Found' }),
    });

    // --- API: dashboard, REST API, escalation boundary ---

    const apiTaskDef = new ecs.FargateTaskDefinition(this, 'ApiTaskDef', {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform,
    });

    apiTaskDef.addContainer('api', {
      image,
      portMappings: [{ containerPort: CONTAINER_PORT }],
      environment: {
        ...temporalEnv,
        APP_ROLE: 'api',
        PORT: String(CONTAINER_PORT),
        PGSSLMODE: 'no-verify',
        POSTGRES_PORT: String(POSTGRES_PORT),
        POSTGRES_DB: config.dbName,
        NATS_URL: config.natsUrl,
        NATS_WS_TARGET: config.natsWsUrl,
        // OAuth sign-in for MCP clients at /mcp.
        LT_OAUTH_ISSUER: `https://${config.domainName}`,
      },
      secrets: {
        ...temporalSecrets,
        POSTGRES_HOST: ecs.Secret.fromSecretsManager(props.dbSecret, 'host'),
        POSTGRES_USER: ecs.Secret.fromSecretsManager(props.dbSecret, 'username'),
        POSTGRES_PASSWORD: ecs.Secret.fromSecretsManager(props.dbSecret, 'password'),
        JWT_SECRET: ecs.Secret.fromSecretsManager(props.jwtSecret),
        NATS_TOKEN: ecs.Secret.fromSecretsManager(props.natsTokenSecret),
      },
      logging: ecs.LogDrivers.awsLogs({ logGroup: this.createLogGroup('api', logs.RetentionDays.ONE_MONTH), streamPrefix: 'api' }),
    });

    bucket.grantReadWrite(apiTaskDef.taskRole);

    const apiService = new ecs.FargateService(this, 'ApiService', {
      cluster,
      taskDefinition: apiTaskDef,
      desiredCount: 1,
      securityGroups: [props.appSecurityGroup],
      ...placement,
      serviceName: 'api',
      healthCheckGracePeriod: cdk.Duration.seconds(120),
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      enableExecuteCommand: true,
      cloudMapOptions: { name: 'api', dnsRecordType: servicediscovery.DnsRecordType.A },
    });

    httpsListener.addTargets('ApiTarget', {
      port: CONTAINER_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [apiService],
      healthCheck: {
        path: HEALTH_PATH,
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
      priority: 1,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/*'])],
    });

    // --- Worker: runs the workflows, calls the API inside the VPC ---

    const workerTaskDef = new ecs.FargateTaskDefinition(this, 'WorkerTaskDef', {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform,
    });

    workerTaskDef.addContainer('worker', {
      image,
      environment: { ...temporalEnv, APP_ROLE: 'worker', LT_URL: config.apiUrl },
      secrets: temporalSecrets,
      logging: ecs.LogDrivers.awsLogs({ logGroup: this.createLogGroup('worker', logs.RetentionDays.ONE_MONTH), streamPrefix: 'worker' }),
      stopTimeout: cdk.Duration.seconds(120),
    });

    bucket.grantReadWrite(workerTaskDef.taskRole);

    // The worker issues its Long Tail key at boot, which retires the previous
    // one, so a deploy stops the old task before starting the new one.
    const workerService = new ecs.FargateService(this, 'WorkerService', {
      cluster,
      taskDefinition: workerTaskDef,
      desiredCount: 1,
      securityGroups: [props.workerSecurityGroup],
      ...placement,
      serviceName: 'worker',
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      circuitBreaker: { rollback: true },
      enableExecuteCommand: true,
    });
    workerService.node.addDependency(apiService);

    // --- DNS ---

    new route53.ARecord(this, 'AliasRecord', {
      zone: props.hostedZone,
      recordName: config.subdomain,
      target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(this.alb)),
    });

    // --- Outputs ---

    new cdk.CfnOutput(this, 'ServiceUrl', { value: `https://${config.domainName}` });
    new cdk.CfnOutput(this, 'AlbDnsName', { value: this.alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
  }

  private createLogGroup(service: string, retention: logs.RetentionDays): logs.LogGroup {
    return new logs.LogGroup(this, `${service}LogGroup`, {
      logGroupName: this.config.logGroup(service),
      retention,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
