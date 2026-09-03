---
"@reflag/flag-evaluation": patch
"@reflag/node-sdk": patch
---

Stringify array-valued context attributes instead of flattening their elements into numeric property paths, allowing rules such as `user.roles CONTAINS "admin"` to evaluate correctly.
