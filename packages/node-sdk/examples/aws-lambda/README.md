# AWS Lambda lifecycle probe

Tests the **local Node SDK source**, not the published package. Requires Node, the
repository dependencies, AWS CLI v2, AWS SAM CLI, and a sandbox AWS profile with
CloudFormation, Lambda, IAM role creation/passing, S3 deployment, and Logs access.
Deployment creates billable AWS resources. No public function URL is created.

## Build and deploy

From the repository root:

```sh
./node_modules/.bin/esbuild packages/node-sdk/examples/aws-lambda/handler.ts --bundle --platform=node --target=node22 --outfile=packages/node-sdk/examples/aws-lambda/build/handler.js
cd packages/node-sdk/examples/aws-lambda
export AWS_PROFILE=your-sandbox-profile AWS_REGION=eu-west-1
aws sts get-caller-identity
sam deploy --template-file template.yaml --stack-name reflag-lambda-probe --resolve-s3 --capabilities CAPABILITY_IAM
FUNCTION=$(aws cloudformation describe-stacks --stack-name reflag-lambda-probe --query 'Stacks[0].Outputs[?OutputKey==`FunctionName`].OutputValue' --output text)
```

Use environment-based temporary credentials instead of a profile if preferred.
Never commit credentials or include them in invocation payloads.

## Reproduce and compare

The default endpoint is a delayed local HTTP server inside Lambda, requiring no
Reflag secret. It deterministically exposes the in-flight flush race, not external
network timeout behavior. The local server freezes with the function.

```sh
for mode in timer full; do
  for gap in 0 1 15 60; do
    sleep "$gap"
    aws lambda invoke --function-name "$FUNCTION" --cli-binary-format raw-in-base64-out \
      --payload "{\"mode\":\"$mode\",\"flush\":true}" /tmp/reflag-lambda-result.json
    python3 -m json.tool /tmp/reflag-lambda-result.json
  done
done
aws logs tail "/aws/lambda/$FUNCTION" --since 30m
```

- `timer`: lets an automatic timer start a request before calling `flush()`.
- `full`: fills a batch before calling `flush()`, like unawaited evaluation events.
- Both must report `pendingAtReturn: 0` with `flush: true` on the patched SDK.
- The original SDK returns with `pendingAtReturn > 0` against the delayed endpoint.
- Set `flush: false` as a negative control; pending work can cross invocations.
- Match `environmentId` to confirm warm reuse; Lambda does not guarantee reuse.
- Counters are cumulative per environment. Check failures, not just pending count:
  SDK flush resolves even when delivery fails and events are discarded.

For an A/B comparison, build/deploy this harness against the original
`src/batch-buffer.ts` in a separate worktree/stack, then repeat identical payloads.

For **real network diagnosis**, set `REFLAG_API_BASE_URL=https://front.reflag.com`
and `REFLAG_SECRET_KEY` on the test Lambda using your approved secret-management
workflow. Use a disposable Reflag environment: this sends real tracking events.
Repeat the warm/cold/gap matrix and compare request durations, HTTP failures, error
names, and pending work. The probe intentionally only tests bulk delivery; it does
not initialize/fetch flag definitions. Also test the customer's runtime, memory,
VPC/NAT configuration, and handler duration before attributing their timeouts to
freeze/thaw. Do not increase timeouts as a substitute for lifecycle coordination.

## Production pattern

Keep a client outside the handler, configure `flagsSyncMode: "in-request"` and
`batchOptions: { intervalMs: 0, flushOnExit: false }`, initialize inside the handler,
and `await client.flush()` in `finally` after application work. Unlike Workers'
`ctx.waitUntil`, Lambda has no equivalent that keeps unawaited SDK work alive after
an async handler returns. Budget Lambda execution time for initialization, flag
refresh, application work and flushing; bulk requests currently have a 10s timeout.
`callbackWaitsForEmptyEventLoop` is not a replacement for awaiting SDK work.

## Cleanup

```sh
sam delete --stack-name reflag-lambda-probe
```

Verify deletion of the stack and log group. SAM's shared managed deployment bucket
may remain; do not remove it if other deployments use it.
