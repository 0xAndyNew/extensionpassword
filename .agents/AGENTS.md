# Workspace Rules for Aegis Vault Extension

## Version Auto-Increment Policy
Whenever any feature, fix, or code update is completed and verified:
1. Automatically run `npm run bump` (or execute `scripts/bump-version.ps1`) to increment the patch version (+1) in both `package.json` and `manifest.json`.
2. Ensure `package.json` and `manifest.json` versions are always in sync.
