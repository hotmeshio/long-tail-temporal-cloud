import { defineStacks } from '../lib/stacks';
import { createApp, synthStacks, templateOf, TEST_ENV, TEST_GITHUB } from './synth';

const TEST_SUBJECT_PREFIX = 'repo:acme@1001/cloud@2002';

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

  it('trusts the subject prefix the repository issues when one is given', () => {
    const stacks = defineStacks(
      createApp({ githubOwner: TEST_GITHUB.owner, githubRepo: TEST_GITHUB.repo, githubSubjectPrefix: TEST_SUBJECT_PREFIX }),
      TEST_ENV,
    );
    const [role] = Object.values(templateOf(stacks.githubOidc!).findResources('AWS::IAM::Role'));
    const [statement] = role.Properties.AssumeRolePolicyDocument.Statement;
    expect(statement.Condition.StringLike).toEqual({
      'token.actions.githubusercontent.com:sub': `${TEST_SUBJECT_PREFIX}:ref:refs/tags/v*`,
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
