# OpenRouter Jev Decisions

OpenClaw provider plugin for OpenRouter Jev Decisions.

## Commands

```bash
npm install
npm run build
npm test
npm run validate
```

`npm run validate` builds the plugin and runs `clawhub package validate . --out .clawhub-validation`.

## Provider Setup

Decision provider `openrouter-jev` via `POST https://openrouter.ai/api/alpha/decisions`.

- Models: `openrouter/typesafe/jev-1.13` (default), `jev-latest` → `~typesafe/jev-latest`
- Auth: plugin `config.apiKey`, else env `OPENROUTER_API_KEY` / `OPENROUTER_JEV_API_KEY`
- Mapping: boolean → `noul` (`instructions` Pflicht), choice, score
- Live-getestet 2026-10-14: 200 OK, `typesafe/jev-1.13-20260917`

## First Publish

Install dependencies, log in to the ClawHub CLI, then validate and publish manually once:

```bash
npm install
npm exec clawhub -- login
npm run validate
npm exec clawhub -- package publish .
```

That first publish creates the ClawHub package and establishes the package managers who can configure trusted publishing.

## Trusted Publishing

After the first publish, configure GitHub Actions OIDC publishing for future releases:

```bash
npm exec clawhub -- package trusted-publisher set openclaw-plugin-openrouter-jev \
  --repository <owner>/<repo> \
  --workflow-filename clawhub-publish.yml
```

Future release publishes can run through the manually dispatched `.github/workflows/clawhub-publish.yml` action without a long-lived ClawHub token. Run it first with `dry_run=true`, then rerun with `dry_run=false` after the preview is clean.
