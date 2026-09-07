# npm trusted publishing runbook

This package uses staged npm publishing from GitHub Actions with short-lived
OpenID Connect (OIDC) credentials. No npm write token belongs in this repository
or in GitHub Actions secrets.

## One-time account configuration

These account changes are deliberately not performed by repository code. Apply
them only under explicit owner authority and in this order:

1. Create and protect the GitHub environment `npm-release` with a required
   reviewer and a deployment-branch rule that permits `main` only.
2. In the npm settings for `sovereign-ai-act-mcp`, add a GitHub Actions trusted
   publisher with these exact fields:
   - Organization or user: `saidbazyar`
   - Repository: `sovereign-ai-act-mcp`
   - Workflow filename: `publish.yml`
   - Environment: `npm-release`
   - Allowed action: `npm stage publish` only
3. Keep direct `npm publish` disabled for this trusted publisher.
4. After the first OIDC staging run succeeds, set npm publishing access to
   **Require two-factor authentication and disallow tokens**. Revoke expired or
   unused npm automation tokens.

## Release sequence

1. Prepare a separately reviewed version commit on `main`. The version must be
   new on npm and aligned across every machine-readable version surface.
2. Run CI and verify the exact commit intended for release.
   The release workflow fails closed on any high or critical production
   dependency advisory.
3. Manually dispatch **Stage npm release (OIDC)** from `main`, enter the exact
   package version, and select the staging confirmation.
4. Approve the protected `npm-release` GitHub environment only after the
   preflight job passes.
5. The workflow submits the package to npm staging. It does not make the package
   public.
6. Review the staged package on npm, then approve it with 2FA to publish it.
7. Verify the public version, provenance attestation, package contents, and MCP
   startup before declaring the release complete.

Never add `NPM_TOKEN`, `NODE_AUTH_TOKEN`, an npm authentication value, or a
direct `npm publish` command to `.github/workflows/publish.yml`.
The workflow also deliberately omits setup-node's `registry-url` input because
that input creates a token-style npm configuration shim. The canonical registry
is locked instead through `package.json`.

Registry uncertainty also fails closed: staging cannot proceed unless the
canonical npm registry confirms that the candidate version does not exist.
