# @mei/infra

AWS CDK (TypeScript). Stacks:

- `data-stack` — DynamoDB single-table, S3 buckets, Cognito user pool.
- `api-stack` — API Gateway + Lambda functions for `services/api`.
- `async-stack` — SQS queues, image-worker, notifier.
- `cdn-stack` — CloudFront distributions for tuned closet thumbs and OOTD.

Bootstrap when the first real stack lands. See `SPEC.md §4`.
