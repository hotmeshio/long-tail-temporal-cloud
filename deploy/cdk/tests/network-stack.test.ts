import { Match } from 'aws-cdk-lib/assertions';

import { synthStacks, templateOf } from './synth';

describe('NetworkStack', () => {
  const template = templateOf(synthStacks().network);

  it('creates one VPC with public and isolated subnets in two zones', () => {
    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.resourceCountIs('AWS::EC2::Subnet', 4);
  });

  it('creates no NAT gateway', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
    template.resourceCountIs('AWS::EC2::EIP', 0);
  });

  it('opens the load balancer to 80 and 443 only', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Load balancer',
      SecurityGroupIngress: [
        Match.objectLike({ CidrIp: '0.0.0.0/0', FromPort: 80, ToPort: 80 }),
        Match.objectLike({ CidrIp: '0.0.0.0/0', FromPort: 443, ToPort: 443 }),
      ],
    });
  });

  it('admits traffic between groups on the service ports only', () => {
    const ingress = Object.values(template.findResources('AWS::EC2::SecurityGroupIngress'))
      .map((rule) => `${rule.Properties.Description}:${rule.Properties.FromPort}`)
      .sort();
    expect(ingress).toEqual([
      'API proxy to NATS WebSocket:9222',
      'API to NATS:4222',
      'API to Postgres:5432',
      'Load balancer to API:3000',
      'Worker to NATS:4222',
      'Worker to Postgres:5432',
    ]);
  });

  it('gives the worker group no inbound rule', () => {
    const groups = template.findResources('AWS::EC2::SecurityGroup', {
      Properties: { GroupDescription: 'Temporal worker tasks, no inbound' },
    });
    const [worker] = Object.values(groups);
    expect(worker.Properties.SecurityGroupIngress).toBeUndefined();
  });
});
