# Contributing

## Development setup

```bash
cp .env.example .env
npm test
npm run check
npm run package:check
```

Use `.env` for machine-specific Mission Control and device/simulator parameters. `.env` is ignored by Git; update `.env.example` when a new non-secret parameter is required.

## Pull requests

- Keep changes focused and explain the safety boundary.
- Add or update executable tests for behavior changes.
- Do not add competition materials, operational state, credentials, private hostnames, or generated local evidence.
- Keep production writes disabled in tests unless a separately authorized integration environment is being used.
- Record new external APIs, models, SDKs, and licenses in `DISCLOSURE.md`.

Before requesting review, run `npm test`, `npm run check`, `npm run package:check`, and `git diff --check`.
