import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { getPreparedPluginSecretInput } from "openclaw/plugin-sdk/secret-input-runtime";

const PLUGIN_ID = "openrouter-jev";
const PROVIDER_ID = "openrouter-jev";
const ENDPOINT = "https://openrouter.ai/api/alpha/decisions";

function entryToText(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function resolveApiKey(api: any): string | undefined {
  try {
    const prep = getPreparedPluginSecretInput(PLUGIN_ID, "config.apiKey") as
      | { value?: string }
      | undefined;
    if (prep?.value) return prep.value;
  } catch {
    // fall through to config/env
  }
  const cfg = (api?.pluginConfig ?? {}) as Record<string, unknown>;
  if (typeof cfg.apiKey === "string" && cfg.apiKey) return cfg.apiKey;
  const env = (globalThis as any)?.process?.env as Record<string, string> | undefined;
  return env?.OPENROUTER_API_KEY || undefined;
}

function mapModel(model: string): string {
  const short = model.includes("/") ? model.split("/").pop()! : model;
  if (short === "jev-latest" || short === "~typesafe/jev-latest") return "~typesafe/jev-latest";
  return "typesafe/jev-1.13";
}

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "OpenRouter Jev Decisions",
  description: "Jev decisions via OpenRouter Decisions API.",
  register(api) {
    (api as any).registerDecisionProvider({
      id: PROVIDER_ID,
      contractVersion: 1 as const,
      isReady() {
        return true;
      },
      async evaluate(batch: any, context: any) {
        const apiKey = resolveApiKey(api);
        if (!apiKey) return { status: "unavailable" as const, reason: "credentials-unavailable" as const };
        const questions: Record<string, any> = {};
        for (const [key, q] of Object.entries(batch.questions as Record<string, any>)) {
          if (q.type === "boolean") {
            const out: any = { type: "noul" };
            const inst = entryToText(q.instructions);
            if (inst !== undefined) out.instructions = inst;
            if (q.criteria && typeof q.criteria === "object") {
              const t = entryToText((q.criteria as any).true);
              const f = entryToText((q.criteria as any).false);
              if (t !== undefined || f !== undefined) {
                out.criteria = {
                  ...(t !== undefined ? { true: t } : {}),
                  ...(f !== undefined ? { false: f } : {}),
                };
              }
            }
            questions[key] = out;
          } else if (q.type === "choice") {
            const out: any = { type: "choice", criteria: {} };
            const inst = entryToText(q.instructions);
            if (inst !== undefined) out.instructions = inst;
            for (const [label, desc] of Object.entries(q.criteria as Record<string, any>)) {
              out.criteria[label] = entryToText(desc) ?? "";
            }
            questions[key] = out;
          } else if (q.type === "score") {
            const out: any = { type: "score", criteria: [] };
            const inst = entryToText(q.instructions);
            if (inst !== undefined) out.instructions = inst;
            out.criteria = (q.criteria as any[]).map((c) => entryToText(c) ?? "");
            questions[key] = out;
          } else {
            return { status: "unavailable" as const, reason: "unsupported-input" as const };
          }
        }
        let state = batch.state;
        if (state === null || typeof state !== "object" || Array.isArray(state)) {
          state = { input: state };
        }
        let res: Response;
        try {
          res = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ model: mapModel(context.model), state, questions }),
            signal: context.signal,
          });
        } catch (e: any) {
          if (e?.name === "AbortError") throw e;
          return { status: "unavailable" as const, reason: "transport" as const };
        }
        if (res.status === 401 || res.status === 403) {
          return { status: "unavailable" as const, reason: "authentication" as const };
        }
        if (res.status === 429) {
          const ra = res.headers.get("retry-after");
          const secs = ra ? Number(ra) : NaN;
          return {
            status: "unavailable" as const,
            reason: "rate-limited" as const,
            ...(Number.isFinite(secs) ? { retryAfterMs: Math.min(secs * 1000, 60000) } : {}),
          };
        }
        if (res.status === 400) {
          return { status: "unavailable" as const, reason: "unsupported-input" as const };
        }
        if (!res.ok) return { status: "unavailable" as const, reason: "transport" as const };
        let data: any;
        try {
          data = await res.json();
        } catch {
          return { status: "unavailable" as const, reason: "invalid-response" as const };
        }
        try {
          const answers: Record<string, any> = {};
          for (const [key, a] of Object.entries(data.answers as Record<string, any>)) {
            if (typeof a.noul === "number") {
              answers[key] = { type: "boolean", probabilityTrue: a.noul };
            } else if (typeof a.choice === "string") {
              answers[key] = {
                type: "choice",
                choice: a.choice,
                probabilities: a.probabilities,
                ...(typeof a.confidence === "number" ? { confidence: a.confidence } : {}),
              };
            } else if (typeof a.score === "number") {
              const probs = a.probabilities;
              const arr = Array.isArray(probs)
                ? probs
                : Object.keys(probs ?? {})
                    .sort((x, y) => Number(x) - Number(y))
                    .map((k) => (probs as any)[k]);
              answers[key] = {
                type: "score",
                score: a.score,
                probabilities: arr,
                ...(typeof a.confidence === "number" ? { confidence: a.confidence } : {}),
              };
            } else {
              return { status: "unavailable" as const, reason: "invalid-response" as const };
            }
          }
          return {
            status: "ok" as const,
            result: {
              model: typeof data.model === "string" ? data.model : mapModel(context.model),
              answers,
              ...(data.usage
                ? {
                    usage: {
                      ...(typeof data.usage.input_tokens === "number"
                        ? { inputTokens: data.usage.input_tokens }
                        : {}),
                      ...(typeof data.usage.output_tokens === "number"
                        ? { outputTokens: data.usage.output_tokens }
                        : {}),
                    },
                  }
                : {}),
            },
          };
        } catch {
          return { status: "unavailable" as const, reason: "invalid-response" as const };
        }
      },
    });
  },
});
