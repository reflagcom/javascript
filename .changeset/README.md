# Changesets

Run `yarn changeset` after changing a publishable package.

Choose the packages that changed, select the appropriate semver bump, and write a short summary for users.

When the PR merges to `main`, the release workflow will either:

- open or update a `Version Packages` PR if there are pending changesets
- publish to npm once that version PR is merged
