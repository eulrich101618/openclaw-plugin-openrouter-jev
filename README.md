# OpenRouter Jev Decisions

Repository: https://github.com/eulrich101618/openclaw-plugin-openrouter-jev

Decision provider plugin for [OpenClaw](https://openclaw.ai) that routes structured evaluations through the [OpenRouter Decisions API](https://openrouter.ai/docs) using Jev models.

## What it does

Registers the `openrouter-jev` decision provider. It accepts OpenClaw decision batches (`boolean`, `choice`, `score`) and returns calibrated probabilities from Jev — useful as an impartial second opinion for agent decisions.

It does not provide chat, completion, or embedding models.

## Models

| ID | Resolves to |
|----|-------------|
| `jev-1.13` | `typesafe/jev-1.13` (default) |
| `jev-latest` | `~typesafe/jev-latest` |

## Requirements

- OpenClaw `>= 2026.9.9`
- An OpenRouter API key with access to Jev models

## Install

Via ClawHub:

```bash
openclaw plugins install clawhub:openclaw-plugin-openrouter-jev
```

Or from source:

```bash
git clone https://github.com/eulrich101618/openclaw-plugin-openrouter-jev.git
cd openclaw-plugin-openrouter-jev
npm install
npm run build
openclaw plugins install ./
```

## Configuration

Set the API key in plugin config or via environment. Precedence:

1. Prepared plugin secret (`config.apiKey` via Gateway secrets)
2. `config.apiKey` in plugin config
3. `OPENROUTER_API_KEY` environment variable

Gateway example:

```bash
openclaw secrets store set OPENROUTER_API_KEY --kind secret
openclaw config set plugins.entries.openrouter-jev.config.apiKey \
  --ref-provider default --ref-source store --ref-id OPENROUTER_API_KEY
openclaw config set plugins.entries.openrouter-jev.enabled true
```

Then select it as decision model in `openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "decisionModel": "openrouter-jev/jev-latest"
    }
  }
}
```

Restart the Gateway after enabling so the provider registers.

## Usage

The provider is consumed through the `decision_evaluate` tool. It receives only the supplied `state` and `questions` — no conversation history, no files.

Supported question types:

- `boolean` → `probabilityTrue` (0–1)
- `choice` → `choice` plus per-option probabilities
- `score` → numeric score plus distribution

Results never authorize actions; the calling agent decides how to use them.

## API

- Endpoint: `POST https://openrouter.ai/api/alpha/decisions`
- Body: `{ model, state, questions }`
- Auth: `Authorization: Bearer <key>`

Unavailable reasons: `credentials-unavailable`, `transport`, `authentication`, `rate-limited` (with `retryAfterMs`), `unsupported-input`, `invalid-response`.

## Workaround (v0.1.1 shows `not-configured`)

v0.1.1 on ClawHub is missing `contracts.decisionProviders`, so the Gateway
ignores the provider. Fix your local install until v0.1.2+ is public:

```bash
# 1. Patch the installed manifest
python3 -c "
import json
p='$HOME/.openclaw/extensions/openrouter-jev/openclaw.plugin.json'
d=json.load(open(p))
d['contracts']={'decisionProviders':['openrouter-jev']}
json.dump(d,open(p,'w'),indent=2)
print('patched')
"

# 2. Re-consent and restart the Gateway
openclaw plugins disable openrouter-jev
openclaw plugins enable openrouter-jev --accept-capabilities
# then: Gateway restart (Control UI or /restart)
```

Verify with `openclaw plugins doctor` (no `openrouter-jev` line = good).

## Development

```bash
npm install
npm test
npm run build
npm run validate
```

`npm run validate` builds the plugin and runs `clawhub package validate . --out .clawhub-validation`.

## Publishing

First publish is manual (creates the package and its managers):

```bash
npm exec clawhub -- login
npm run validate
npm exec clawhub -- package publish .
```

Later releases use trusted publishing via `.github/workflows/clawhub-publish.yml` (manual dispatch with `dry_run` preview first).

## License

MIT
