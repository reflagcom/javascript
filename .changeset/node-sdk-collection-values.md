---
"@reflag/node-sdk": major
"@reflag/openfeature-node-provider": patch
---

Adopt evaluator v2 and the complete `GET /flags` collection protocol in the Node SDK.

- `getFlag(context, key)` and bound `getFlag(key)` are direct Boolean reads with an implicit `false` default. Positional defaults infer the value type, widening literals, without generated declarations. Non-null defaults require the same top-level JSON category; missing/mismatched values use the default without authored-selection metadata. An explicit `null` default accepts arbitrary JSON, including authored null. Nested payload schemas are not validated. There is no flag wrapper, `.isEnabled`, `.config`, or flag `.track()` method. Batch `getFlags()` keeps raw JSON/`undefined` values. Ordinary client `track()` APIs remain separate.
- Singular remote reads share the default contract. Root `getFlagRemote(key, defaultValue, userId?, companyId?, context?)` puts the default second, moving old positional IDs one place right; pass `undefined` for a Boolean read with IDs. Bound `getFlagRemote(key, defaultValue?)` needs no explicit IDs.
- Reads immediately register checks for requested roots. Checks carry the selected variant key as `evalResult`, `sourceVersionId`, and the snapshot `flagStateVersion`. Boolean values send the keys `"true"` / `"false"`. Equal-valued variants and dependency-only version changes retain their distinct identities. Delivery remains buffered and rate-limited.
- Prepare complete flags/segments snapshots before atomically accepting them. Evaluate references recursively without dependency-result caching.
- Persist full graphs and snapshot versions in version-2 fallback snapshots. V1 snapshots are not converted. Built-in storage uses separate versioned keys/files so V1 and V2 clients cannot overwrite one another's snapshots. Local overrides and value-only fallbacks do not fabricate authored variant selections.
- Bootstrap state contains v2 selection results and context/version metadata, without registering browser checks. Existing v1 browser bootstrap consumers require a separate migration; this is not a backwards-compatible bootstrap shape.
- Preserve sync modes, ordinary tracking, bound contexts, and post-evaluation override layering. Update the Express example to consume direct values.

The existing OpenFeature provider and v1 React bootstrap demo remain explicitly pinned to published Node SDK v1 through an npm alias. This prevents automatic workspace dependency upgrades from silently breaking their wrapper/bootstrap contracts; migrating those consumers to multivariate values is separate work.

This release requires the collection-capable evaluator and compatible `/flags` and variant-key check ingestion. It does not migrate legacy remote config into multivariate flag values.
