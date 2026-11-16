import { defineStacks } from '../lib/stacks';
import { createApp, synthStacks, templateOf, TEST_ENV, TEST_GITHUB } from './synth';

describe('GithubOidcStack', () => {
  const template = templateOf(synthStacks().githubOidc!);

  it('trusts version-tag runs of the one repo', () => {
    const [role] = Object.values(template.findResources('AWS::IAM::Role'));
    const [statement] = role.Properties.AssumeRolePolicyDocument.Statement;
    expect(statement.Action).toBe('sts:AssumeRoleWithWebIdentity');
    expect(statement.Condition).toEqual({
      StringLike: {
        'token.actions.githubusercontent.com:sub': `repo:${TEST_GITHUB.owner}/${TEST_GITHUB.repo}:ref:refs/tags/v*`,
      },
      StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
    });
  });

  it('imports the account provider and creates none', () => {
    template.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 0);
    template.resourceCountIs('AWS::IAM::OIDCProvider', 0);
    const [role] = Object.values(template.findResources('AWS::IAM::Role'));
    expect(JSON.stringify(role.Properties.AssumeRolePolicyDocument)).toContain(
      `arn:aws:iam::${TEST_ENV.account}:oidc-provider/token.actions.githubusercontent.com`,
    );
  });

  it('names the role after the project', () => {
    template.hasResourceProperties('AWS::IAM::Role', { RoleName: 'OnPremCloud-GithubActionsDeployRole' });
  });

  it('is left out when no repository is given', () => {
    expect(defineStacks(createApp(), TEST_ENV).githubOidc).toBeUndefined();
  });
});
