# Deploy to AWS

The CDK app in `deploy/cdk` runs this cloud in its own VPC: the API and dashboard behind a load balancer at `https://<subdomain>.<zone>`, a Temporal worker, NATS, Postgres and an assets bucket. Workflows run in a Temporal Cloud namespace.

## What gets created

| Stack | Resources |
|---|---|
| `OnPremCloud-Network` | VPC across 2 AZs with public and isolated subnets; security groups for the load balancer, API, worker, NATS and Postgres |
| `OnPremCloud-Data` | Postgres 16 on `db.t4g.micro` in the isolated subnets, the assets bucket, and the secrets below |
| `OnPremCloud-Dns` | ACM certificate for the site name, validated through the Route 53 zone |
| `OnPremCloud-Compute` | ECS cluster with three ARM64 Fargate services (`api`, `worker`, `nats`), the load balancer (80 redirects to 443), a web ACL that throttles sign-in attempts, and the alias record |
| `OnPremCloud-GithubOidc` | The role GitHub Actions assumes to deploy, limited to version tags of one repository |

Tasks run in the public subnets with public addresses for their outbound calls to Temporal Cloud, ECR, Secrets Manager and S3. The API accepts traffic from the load balancer and the worker; the worker accepts none; Postgres and NATS accept the API.

## Where each secret lives

| Value | Local | CI | Runtime |
|---|---|---|---|
| Temporal API key | `.env` | | `OnPremCloud/TemporalApiKey`, written once by you |
| Admin password | `.env` | read from Secrets Manager by the smoke job | `OnPremCloud/AdminPassword`, generated |
| JWT signing key | `.env` | | `OnPremCloud/JwtSigningKey`, generated |
| NATS token | compose default | | `OnPremCloud/NatsToken`, generated |
| Database credentials | compose default | | `OnPremCloud/Database`, generated |
| Worker's Long Tail key | minted at boot | | minted at boot by signing in as the admin |
| Site key | `npm run site-key` | | held by the site |

ECS injects the secrets into the tasks at start. GitHub holds one role ARN and plain settings as repository variables, and reaches AWS through OIDC.

## First deploy

You need an AWS account with a Route 53 hosted zone, a Temporal Cloud namespace with API key authentication, and a service account API key for it.

```bash
cd deploy/cdk
npm ci

export AWS_PROFILE=...            # the account to deploy into
export AWS_REGION=us-west-2
export LT_HOSTED_ZONE_DOMAIN=example.com
export LT_SUBDOMAIN=cloud
export TEMPORAL_ADDRESS=us-west-2.aws.api.temporal.io:7233
export TEMPORAL_NAMESPACE=my-namespace.a1b2c

# 1. Once per account and region
npx cdk bootstrap

# 2. Network, database, bucket and secrets
npx cdk deploy OnPremCloud-Network OnPremCloud-Data

# 3. Store the Temporal API key (the prompt keeps it out of shell history)
read -rs TEMPORAL_KEY && aws secretsmanager put-secret-value \
  --secret-id OnPremCloud/TemporalApiKey --secret-string "$TEMPORAL_KEY"; unset TEMPORAL_KEY

# 4. Certificate, services, DNS
npx cdk deploy --all
```

Step 4 builds the image from the repository root for ARM64, so run it on an ARM machine or with Docker's `linux/arm64` emulation.

Sign in at `https://<subdomain>.<zone>` as `superadmin` with the generated password:

```bash
aws secretsmanager get-secret-value --secret-id OnPremCloud/AdminPassword --query SecretString --output text
```

MCP clients connect at `https://<subdomain>.<zone>/mcp` and sign in through the same page. In Claude Code:

```bash
claude mcp add --transport http cloud https://cloud.example.com/mcp
```

Then `/mcp`, choose the server, and authenticate.

Then run one order through the handoff:

```bash
LT_URL=https://cloud.example.com LT_ADMIN_PASSWORD=... npm run smoke
```

## Deploys from GitHub Actions

Create the deploy role once. The stack uses the GitHub OIDC provider the account already has.

```bash
npx cdk deploy OnPremCloud-GithubOidc -c githubOwner=<owner> -c githubRepo=<repo>
```

The role trusts tokens whose subject starts with `repo:<owner>/<repo>`. A repository with immutable subject claims issues a prefix that carries the owner and repository ids. Read it, and pass it when it differs:

```bash
gh api repos/<owner>/<repo>/actions/oidc/customization/sub --jq .sub_claim_prefix
npx cdk deploy OnPremCloud-GithubOidc -c githubOwner=<owner> -c githubRepo=<repo> \
  -c githubSubjectPrefix='repo:<owner>@<owner-id>/<repo>@<repo-id>'
```

Set these repository variables:

| Variable | Value |
|---|---|
| `AWS_ROLE_ARN` | the `RoleArn` output of `OnPremCloud-GithubOidc` |
| `AWS_REGION` | the region you deployed to |
| `LT_HOSTED_ZONE_DOMAIN`, `LT_SUBDOMAIN` | the site name |
| `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE` | the namespace |

Pushing a tag such as `v0.1.0` runs `.github/workflows/deploy.yml`: tests, `cdk deploy --all` on an ARM runner, then `npm run smoke` against the deployed site.

The smoke run starts an order and resolves it within about a second as its own bot, `handoff-smoke`. A connected site polls the same queue and can claim that order in the same second.

The deploy role holds `AdministratorAccess`, which CloudFormation needs to create the resources above. In an account shared with other systems, replace it with a policy scoped to these stacks.

## Rotating the Temporal API key

```bash
read -rs TEMPORAL_KEY && aws secretsmanager put-secret-value \
  --secret-id OnPremCloud/TemporalApiKey --secret-string "$TEMPORAL_KEY"; unset TEMPORAL_KEY
aws ecs update-service --cluster onpremcloud --service api --force-new-deployment
aws ecs update-service --cluster onpremcloud --service worker --force-new-deployment
```

## Cost

About $95 a month in `us-west-2` at rest: Fargate (three small ARM tasks) $36, load balancer $17, public IPv4 addresses $18, Postgres $14, web ACL $7, secrets $2. Temporal Cloud bills separately.

## Teardown

```bash
npx cdk destroy --all
```

The database leaves a final snapshot and the assets bucket is retained; delete both by hand when the data is no longer needed.

## Tests

```bash
cd deploy/cdk
npm run build   # typecheck
npm test        # synthesizes every stack with fixed context, no AWS calls
```
