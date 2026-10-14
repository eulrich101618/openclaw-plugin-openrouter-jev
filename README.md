# OpenRouter Jev Decisions

Repository: https://github.com/eulrich101618/openclaw-plugin-openrouter-jev

Decision provider plugin for [OpenClaw](https://openclaw.ai) that routes structured evaluations through the [OpenRouter Decisions API](https://openrouter.ai/docs) using Jev models.

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

```bash
openclaw plugins install clawhub:openclaw-plugin-openrouter-jev
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

## License

MIT
