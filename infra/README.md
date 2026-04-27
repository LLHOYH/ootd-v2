# @mei/infra

AWS CDK (TypeScript v2) app for Mei. Stacks live under `lib/stacks/`.

## Stacks

| Stack | Status | Purpose |
|---|---|---|
| `data-stack` | shipping in this branch | DynamoDB single-table, S3 buckets, Cognito user pool + mobile client. |
| `api-stack` | future branch | API Gateway + Lambda functions for `services/api`. |
| `async-stack` | future branch | SQS queues, image-worker, notifier (consumes the DDB stream). |
| `cdn-stack` | future branch | CloudFront distributions for `closet/tuned` and `ootd`. |

This branch wires up `data-stack` only. The bin entry instantiates one `dev`
instance; the `prod` instance is ready in commented form.

## What `data-stack` creates

- **DynamoDB** — `mei-main-{stage}` (single-table, PK+SK, GSI1, GSI2,
  PITR on, NEW_AND_OLD_IMAGES stream). See `SPEC.md §6.1`.
- **S3 buckets** (see `SPEC.md §6.3`):
  - `mei-closet-raw-{stage}-{accountId}` — SSE-S3, versioned, 30-day
    Glacier transition.
  - `mei-closet-tuned-{stage}-{accountId}` — SSE-S3, CloudFront-friendly
    (block public access + enforce SSL). The CDN branch will attach the OAC.
  - `mei-selfies-{stage}-{accountId}` — SSE-KMS via dedicated key
    (`alias/mei-selfies-{stage}`), no CDN, no lifecycle.
  - `mei-ootd-{stage}-{accountId}` — SSE-S3, served via signed URLs.
- **Cognito** — `mei-{stage}` user pool with email + username sign-in,
  custom attrs (`birthYear`, `countryCode`, `city`), 10-char password
  policy, MFA off (dev) / optional (prod), email-only recovery. One mobile
  app client (SRP-only, no secret, 30-day refresh). Apple + Google IdPs
  scaffolded but gated behind `appleConfigured` / `googleConfigured` props.

## Outputs

The stack exports (via `CfnOutput` + `exportName`):

- `mei-{stage}-main-table-name`
- `mei-{stage}-main-table-stream-arn`
- `mei-{stage}-closet-raw-bucket`
- `mei-{stage}-closet-tuned-bucket`
- `mei-{stage}-selfies-bucket`
- `mei-{stage}-selfies-kms-arn`
- `mei-{stage}-ootd-bucket`
- `mei-{stage}-user-pool-id`
- `mei-{stage}-user-pool-client-id`

The api-stack, async-stack, and cdn-stack will consume these via
`Fn.importValue` once they land on their own branches.

## Required env vars

For `cdk synth` (no AWS creds needed; placeholders kick in):

```bash
# Optional — fall back to placeholders if unset.
export CDK_DEFAULT_ACCOUNT=111111111111
export CDK_DEFAULT_REGION=ap-northeast-1
```

For `cdk deploy` (NOT done in this branch):

```bash
export CDK_DEFAULT_ACCOUNT=<real account>
export CDK_DEFAULT_REGION=<region>
# Plus AWS_PROFILE / SSO creds.
```

## Commands

```bash
pnpm --filter @mei/infra synth       # cdk synth → cdk.out/
pnpm --filter @mei/infra diff        # cdk diff against deployed state
pnpm --filter @mei/infra typecheck   # tsc --noEmit
```

No `cdk deploy` script is wired here on purpose — a human runs the
deploy once accounts are bootstrapped.

## Open TODOs (left as comments in code)

- `cdn-stack`: attach CloudFront OAC + bucket policy for `closet/tuned`
  and `ootd`.
- Cognito hosted UI domain — uncomment once we want to claim
  `mei-{stage}` as a Cognito-hosted prefix.
- Apple + Google identity provider client IDs/secrets — pull from SSM /
  Secrets Manager once the developer accounts are ready.

## Notes

- No real account IDs or region literals are baked in — everything resolves
  through CDK context or env vars.
- `removalPolicy` is `DESTROY` in dev and `RETAIN` in prod.
- The single-table stream is enabled now so the async-stack branch can
  attach Lambda event sources without re-creating the table.
