import { synthStacks, templateOf } from './synth';

describe('LoginWaf', () => {
  const template = templateOf(synthStacks().compute);

  it('attaches one regional web ACL to the load balancer', () => {
    template.resourceCountIs('AWS::WAFv2::WebACL', 1);
    template.resourceCountIs('AWS::WAFv2::WebACLAssociation', 1);
    template.hasResourceProperties('AWS::WAFv2::WebACL', { Scope: 'REGIONAL', DefaultAction: { Allow: {} } });
  });

  it('throttles password login per client address with a 429', () => {
    const [acl] = Object.values(template.findResources('AWS::WAFv2::WebACL'));
    const rule = acl.Properties.Rules.find((entry: { Name: string }) => entry.Name === 'login-rate-limit');
    expect(rule.Action.Block.CustomResponse.ResponseCode).toBe(429);
    expect(rule.Statement.RateBasedStatement).toMatchObject({
      Limit: 30,
      EvaluationWindowSec: 300,
      AggregateKeyType: 'IP',
    });
  });

  it('applies the AWS address reputation list first', () => {
    const [acl] = Object.values(template.findResources('AWS::WAFv2::WebACL'));
    expect(acl.Properties.Rules[0].Statement.ManagedRuleGroupStatement.Name).toBe('AWSManagedRulesAmazonIpReputationList');
  });
});
