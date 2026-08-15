# Public Release Disclosure

## Scope and license

This repository contains the TrustOps Automation collaboration runtime, contracts, synthetic scenarios, tests, and packaging helpers. It does not contain Mission Control source, Mission Control data, competition materials, private operational state, credentials, or real device data.

The repository code is released under the MIT License in [`LICENSE`](LICENSE). The copyright and contributor authorization for this release must be confirmed by the maintainers before the GitHub visibility change.

## Data and reproducibility

- Test and demo inputs are synthetic fixtures.
- The default configuration is isolated and dry-run.
- Reproduction requires Node.js 20 or newer and a local copy of this repository.
- Run `cp .env.example .env`, then `npm test`, `npm run check`, and `npm run package:check`.
- Real endpoint addresses, credentials, device identifiers, and deployment paths belong only in the ignored `.env` file.

## External interfaces

The adapter can communicate with an externally operated Mission Control-compatible HTTP API. The endpoint, authentication token, and optional device/simulator endpoint are configuration inputs. No external service credentials are distributed here.

The repository does not redistribute closed-source models, commercial API credentials, proprietary SDKs, or third-party source code. Maintainers must add a dependency/license inventory when introducing such dependencies.

## Provenance and maintenance

The public branch is a sanitized release boundary derived from the private competition/development repository. Competition handbook files, internal planning documents, operational journals, and private infrastructure references are intentionally excluded. Contributors must preserve the dry-run safety default, update tests for contract changes, and record any new third-party dependency and license in this file.

## Known limits

The public tests prove local contract behavior and isolated adapter behavior. They do not prove production Mission Control writes, real payment processing, physical vehicle control, or an external AgentTeams deployment.
