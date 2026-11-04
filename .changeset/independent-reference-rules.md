---
"@reflag/flag-evaluation": minor
"@reflag/node-sdk": patch
---

Support optional `ruleEvaluation: "independent"` annotations on compiled OR groups used for flag references. A valid matching referenced rule is no longer suppressed by errors in an independent sibling; diagnostics remain available. Ordinary authored AND/OR filters and unmatched invalid negated references retain fail-closed behavior. Older evaluators ignore the optional annotation and retain their existing behavior.
