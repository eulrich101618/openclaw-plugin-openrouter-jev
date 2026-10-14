import { describe, expect, it } from "vitest";
import type { OpenClawPluginApi, ProviderPlugin } from "openclaw/plugin-sdk/plugin-entry";
import entry from "./index.js";

describe("openrouter-jev", () => {
  it("registers the provider and resolves its authenticated catalog", async () => {
    const providers: ProviderPlugin[] = [];
    const api = {
      registerProvider(provider: ProviderPlugin) {
        providers.push(provider);
      },
    } as Partial<OpenClawPluginApi>;

    entry.register(api as OpenClawPluginApi);

    expect(providers.map((provider) => provider.id)).toEqual(["openrouter-jev"]);
    expect(providers[0]?.label).toBe("OpenRouter Jev Decisions");
    expect(providers[0]?.envVars).toEqual(["OPENROUTER_JEV_API_KEY"]);

    const provider = providers[0];
    if (!provider?.catalog) {
      throw new Error("Generated provider did not register its catalog");
    }
    expect(provider.auth).toMatchObject([
      { id: "api-key", kind: "api_key", starterModel: "openrouter-jev/example-chat" },
    ]);
    for (const [apiKey, configuredId, baseUrl, expectedBaseUrl] of [
      [undefined, "openrouter-jev", "https://configured.example/v1", null],
      ["fixture-api-key", "openrouter-jev-unrelated", "https://unrelated.example/v1", "https://api.example.com/v1"],
      ["fixture-api-key", " OPENROUTER-JEV ", " https://configured.example/v1 ", "https://configured.example/v1"],
      ["fixture-api-key", "openrouter-jev", " ", "https://api.example.com/v1"],
    ] as const) {
      const result = await provider.catalog.run({
        config: { models: { providers: { [configuredId]: { baseUrl, models: [] } } } },
        env: {},
        resolveProviderApiKey: () => ({ apiKey }),
        resolveProviderAuth: () => ({ apiKey, mode: "api_key", source: "env" }),
      });
      expect(result).toEqual(
        expectedBaseUrl === null
          ? null
          : {
              provider: {
                api: "openai-completions",
                apiKey,
                baseUrl: expectedBaseUrl,
                models: [{
                  id: "example-chat",
                  name: "Example Chat",
                  reasoning: false,
                  input: ["text"],
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                  contextWindow: 128000,
                  maxTokens: 8192,
                }],
              },
            },
      );
    }
  });
});
