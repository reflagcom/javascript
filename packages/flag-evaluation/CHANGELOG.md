# @reflag/flag-evaluation

## 1.1.0

### Minor Changes

- 385e3f5: Add type-preserving native-array context evaluation with `ANY_OF`, `NOT_ANY_OF`, `SET`, and `NOT_SET` semantics. Unsupported array operators evaluate to false and produce non-fatal diagnostics that the Node SDK surfaces as rate-limited warnings.

## 1.0.1

### Patch Changes

- 338e9d2: Prevent prototype pollution when unflattening JSON with unsafe property paths.
