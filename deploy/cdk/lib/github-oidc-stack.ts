import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

import { GITHUB_OIDC_HOST, type DeployConfig } from './config';

const OIDC_AUDIENCE = 'sts.amazonaws.com';

export interface GithubOidcStackProps extends cdk.StackProps {
  config: DeployConfig;
  githubOwner: string;
  githubRepo: string;
}

/**
 * The role GitHub Actions assumes to deploy. It trusts the account's existing
 * GitHub OIDC provider and only runs started by a version tag in this repo.
 */
export class GithubOidcStack extends cdk.Stack {
  public readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const { config, githubOwner, githubRepo } = props;

    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GithubOidcProvider',
      `arn:aws:iam::${this.account}:oidc-provider/${GITHUB_OIDC_HOST}`,
    );

    this.deployRole = new iam.Role(this, 'GithubActionsRole', {
      roleName: config.deployRoleName,
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringLike: { [`${GITHUB_OIDC_HOST}:sub`]: `repo:${githubOwner}/${githubRepo}:ref:refs/tags/v*` },
        StringEquals: { [`${GITHUB_OIDC_HOST}:aud`]: OIDC_AUDIENCE },
      }),
      // Broad on purpose for a single-purpose account. In a shared account,
      // narrow this to sts:AssumeRole on the cdk-* bootstrap roles plus read
      // of the admin password secret.
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')],
      maxSessionDuration: cdk.Duration.hours(1),
    });

    new cdk.CfnOutput(this, 'RoleArn', { value: this.deployRole.roleArn });
  }
}
