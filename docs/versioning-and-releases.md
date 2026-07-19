# Versioning and Releases

## Version source

`VERSION` at the repository root is the single source of the MedizinHub HMS
product release version. The current baseline remains `0.1.0`. Example values
such as `1.2.44` are documentation examples only and must not be copied into
configuration unless that release is actually being prepared.

Versions use Semantic Versioning:

- `MAJOR`: incompatible platform or API changes.
- `MINOR`: backward-compatible features.
- `PATCH`: backward-compatible fixes.
- Optional pre-release versions are supported, such as `1.3.0-rc.1`.

The Alembic database revision is separate from the product version.

## Display and runtime identity

The backend reads the root version during local source execution. Official
Docker deployments inject the same value as `MEDIZINHUB_APP_VERSION`. The
health and readiness responses expose the release version, Git commit, build
time, and environment. The notification inbox continues to display only the
customer-friendly product version, for example `MedizinHub v0.1.0`.

`MEDIZINHUB_APP_VERSION` remains an intentional runtime override for testing
and emergency diagnostics. It must not be maintained independently in example
environment files.

## Preparing a release

From the repository root:

```bash
node scripts/version.mjs check
node scripts/version.mjs set 1.2.44
```

Use the real approved release number in place of the example. Then:

1. Move completed entries from `Unreleased` into a dated changelog section.
2. Run the full quality checks and migration checks.
3. Commit the version and changelog together.
4. Create the matching immutable Git tag, such as `v1.2.44`.
5. Deploy through CI/CD. The deployment injects the version and build metadata.
6. Confirm `/health` and `/api/v1/health` report the expected identity.
7. Publish the in-app version announcement only after the deployment is healthy.

Never edit application source code merely to change the release number, reuse a
released version, or use the product version as a database migration number.

## Rollback

Rollback uses the previously built commit/image and therefore restores its
original version metadata automatically. Do not change `VERSION` to disguise a
rollback. Database rollback safety must be evaluated separately because schema
compatibility and product versioning are different concerns.
