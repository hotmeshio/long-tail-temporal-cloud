import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

import { CONTAINER_PORT, NATS_PORT, NATS_WS_PORT, POSTGRES_PORT } from './config';

/**
 * A VPC with public and isolated subnets and no NAT gateway. Tasks run in the
 * public subnets with public addresses for outbound calls (Temporal Cloud,
 * ECR, Secrets Manager, S3); their security groups admit only the traffic
 * listed here. The database sits in the isolated subnets.
 */
export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly appSecurityGroup: ec2.SecurityGroup;
  public readonly workerSecurityGroup: ec2.SecurityGroup;
  public readonly natsSecurityGroup: ec2.SecurityGroup;
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // Security groups live here so the data and compute stacks can both reference them.

    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: this.vpc,
      description: 'Load balancer',
    });
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP from anywhere');
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS from anywhere');

    this.workerSecurityGroup = new ec2.SecurityGroup(this, 'WorkerSecurityGroup', {
      vpc: this.vpc,
      description: 'Temporal worker tasks, no inbound',
    });

    this.appSecurityGroup = new ec2.SecurityGroup(this, 'AppSecurityGroup', {
      vpc: this.vpc,
      description: 'API tasks',
    });
    this.appSecurityGroup.connections.allowFrom(this.albSecurityGroup, ec2.Port.tcp(CONTAINER_PORT), 'Load balancer to API');

    this.natsSecurityGroup = new ec2.SecurityGroup(this, 'NatsSecurityGroup', {
      vpc: this.vpc,
      description: 'NATS event bus',
    });
    this.natsSecurityGroup.connections.allowFrom(this.appSecurityGroup, ec2.Port.tcp(NATS_PORT), 'API to NATS');
    this.natsSecurityGroup.connections.allowFrom(this.workerSecurityGroup, ec2.Port.tcp(NATS_PORT), 'Worker to NATS');
    this.natsSecurityGroup.connections.allowFrom(this.appSecurityGroup, ec2.Port.tcp(NATS_WS_PORT), 'API proxy to NATS WebSocket');

    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc: this.vpc,
      description: 'Postgres',
    });
    this.dbSecurityGroup.connections.allowFrom(this.appSecurityGroup, ec2.Port.tcp(POSTGRES_PORT), 'API to Postgres');
    this.dbSecurityGroup.connections.allowFrom(this.workerSecurityGroup, ec2.Port.tcp(POSTGRES_PORT), 'Worker to Postgres');
  }
}
