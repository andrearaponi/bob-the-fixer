# SonarQube Contract / E2E Harness (Bob)

This folder contains everything needed to validate end-to-end (contract tests) that SonarQube APIs return the payloads Bob expects, and that Bob consumes them correctly (e.g., **plain text** snippets without HTML).

## What's Included

- `fixture-java-template/`: Minimal Java project that generates real issues (e.g., `java:S1854`)
- `patches/`: Patch to simulate a "FIXED" issue between two analyses (used to test `includeSimilarFixed`)
- `sonar-contract.test.ts`: Vitest tests (skipped by default) that verify API invariants + Bob client behavior
- `scripts/bootstrap.sh`: Script to set up the fixture project and run analyses

## Quick Start

### Prerequisites

- Bob must be installed (`install.sh` already run)
- SonarQube must be running on `localhost:9000`
- Maven must be installed (for Java analysis)

### Run the Tests

1. **Bootstrap** (creates project, runs two analyses to generate OPEN + FIXED issues):

```bash
cd packages/core/tests/e2e/sonar-contract
bash scripts/bootstrap.sh
```

The bootstrap script automatically loads `SONAR_TOKEN` from Bob's main `.env` file.

2. **Run the contract tests**:

```bash
cd packages/core
source tests/e2e/sonar-contract/.work/.env
npm test -- tests/e2e/sonar-contract/sonar-contract.test.ts
```

## Environment Variables

Tests are **disabled by default**. The bootstrap script creates a `.work/.env` file with:

- `SONAR_E2E=1` - Enables the E2E tests
- `SONAR_E2E_URL` - SonarQube URL (default: `http://localhost:9000`)
- `SONAR_E2E_PROJECT_KEY` - Project key (default: `demo-bob-e2e`)
- `SONAR_E2E_TOKEN` - Authentication token (loaded from Bob's main `.env`)
- `SONAR_E2E_FIXTURE_DIR` - Path to the analyzed Java fixture

### Custom Configuration

You can override defaults by setting environment variables before running bootstrap:

```bash
SONAR_E2E_URL="http://custom-sonar:9000" bash scripts/bootstrap.sh
```

Or pass an existing token:

```bash
SONAR_E2E_TOKEN="squ_xxx" bash scripts/bootstrap.sh
```

## What We Validate

- `api/sources/index` returns **plain text** snippets and `to` is **exclusive**
- `api/sources/lines` includes `code` with HTML markup (and Bob must **not** propagate that HTML in its snippets)
- `SonarQubeClient.getSourceLines()` returns lines consistent with the analyzed file (plain text, no `<span ...>`)
- The fixture project generates both **OPEN** and **FIXED** issues for `java:S1854` (used to test `includeSimilarFixed`)

## How It Works

1. Bootstrap copies `fixture-java-template/` to `.work/demo-bob-java/`
2. First Maven analysis → creates OPEN issues (unused variable in `deletePerson`)
3. Patch is applied → removes the unused variable
4. Second Maven analysis → the issue becomes FIXED
5. Tests verify both OPEN and FIXED issues exist for `java:S1854`

## Operational Notes

- Tokens are saved in `.work/.env` (gitignored). Do not commit.
- If you change SonarQube version, these tests are designed to "break" when API contracts change.
- The `.work/` directory is excluded from git and SonarQube SCM analysis.

## Troubleshooting

### Elasticsearch fails to start (`CONFIG_SECCOMP not compiled into kernel`)

If you see this error in logs:

```
seccomp unavailable: CONFIG_SECCOMP not compiled into kernel
```

This is a kernel limitation in the Podman VM / host. Elasticsearch (in SonarQube 25.x) requires seccomp.

**Solutions:**
- Use Bob's main SonarQube instance (already configured with `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true`)
- Use Docker Desktop (which has a kernel with seccomp support)
- Recreate Podman machine with a kernel that supports seccomp

### Authentication errors

If you see 401 errors, ensure:
1. Bob is installed and `.env` exists in the repo root
2. The token in `.env` is valid
3. SonarQube is running on `localhost:9000`

### "0 source files to be analyzed"

If Maven analysis reports 0 files, the bootstrap script already includes `-Dsonar.scm.disabled=true` to handle files in `.gitignore`d directories.
