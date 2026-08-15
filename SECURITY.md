# Security Policy

## Supported versions

Security fixes are applied to the latest `main` release line. Older snapshots may not receive fixes.

## Reporting a vulnerability

Please do not open a public issue for credentials, private endpoints, exploitable details, or personal data. Contact the maintainers through the private security channel configured for the hosting organization and include:

- affected version or commit
- reproducible steps
- impact assessment
- a minimal proof of concept, if safe

Remove tokens, passwords, device identifiers, and private hostnames from reports.

## Safety boundary

The default configuration is `DRY_RUN=true`, `REQUIRE_APPROVAL=true`, and `ALLOW_PRODUCTION_WRITES=false`. Never commit `.env`, credentials, real endpoint addresses, device identifiers, production evidence, or private deployment paths. Use `.env.example` only for localhost/example values.
