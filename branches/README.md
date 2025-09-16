# Branch snapshots

The contents of this directory capture repository states that need to live on
branches other than `main`.

- `test/` is a full snapshot of commit 5c568e3, which included the GitHub Pages
  voice bridge and related UI updates. Those commits were reverted from the
  current branch so they can be pushed to the dedicated `test` branch instead.

To update the remote `test` branch with these files:

1. Check out the `test` branch in a clean working tree.
2. Copy the contents of `branches/test` over the root of the repository (or use
   `git checkout 5c568e3 -- .` directly from this commit hash).
3. Commit and push the changes to `test`.

This snapshot lets you keep developing on `main` while safely applying the
reverted work to `test`.
