# @reflag/flag-evaluation

## 1.1.1

### Patch Changes

- 80f2e8f: Fix `CONTAINS` and `NOT_CONTAINS` for array-valued context. `CONTAINS` now checks for an exact, case-sensitive array element; `NOT_CONTAINS` checks its absence. Both use the first comparison value, while `ANY_OF` and `NOT_ANY_OF` continue to support multiple comparison values. Empty arrays do not contain any value.

  Support `IS` for arrays containing exactly one element equal to the comparison value; `IS_NOT` matches all other present arrays, including empty arrays and arrays with duplicate matching elements. Missing fields still fail closed. Scalar equality is unchanged.

  Scalar strings retain case-insensitive substring matching. Supported array equality and membership checks no longer produce `UNSUPPORTED_ARRAY_OPERATOR` warnings in Node SDK flag targeting or config evaluation.

## 1.1.0

### Minor Changes

- 385e3f5: Add type-preserving native-array context evaluation with `ANY_OF`, `NOT_ANY_OF`, `SET`, and `NOT_SET` semantics. Unsupported array operators evaluate to false and produce non-fatal diagnostics that the Node SDK surfaces as rate-limited warnings.

## 1.0.1

### Patch Changes

- 338e9d2: Prevent prototype pollution when unflattening JSON with unsafe property paths.
