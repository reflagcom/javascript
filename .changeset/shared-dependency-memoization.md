---
"@reflag/flag-evaluation": patch
---

Memoize flag and segment results within each evaluation to avoid repeated work in shared dependency graphs. Batch evaluation shares these results across roots, but separate calls and contexts never share cached results. Preserve variant-key matching, rule traces, diagnostic provenance and deduplication, and fail-closed handling of cached dependency errors.
