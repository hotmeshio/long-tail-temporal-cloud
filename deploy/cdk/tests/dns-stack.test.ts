import { synthStacks, templateOf, TEST_SUBDOMAIN, TEST_ZONE } from './synth';

describe('DnsStack', () => {
  const { dns } = synthStacks();
  const template = templateOf(dns);

  it('requests a DNS-validated certificate for the service name', () => {
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: `${TEST_SUBDOMAIN}.${TEST_ZONE}`,
      ValidationMethod: 'DNS',
    });
  });

  it('looks the hosted zone up and creates none', () => {
    template.resourceCountIs('AWS::Route53::HostedZone', 0);
    expect(dns.hostedZone.zoneName).toBe(TEST_ZONE);
  });

  it('exports the certificate ARN', () => {
    template.hasOutput('CertificateArn', {});
  });
});
