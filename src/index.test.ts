import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import entry from "./index.js";

function collectProvider() {
  const providers: any[] = [];
  const api = {
    registerDecisionProvider(provider: any) {
      providers.push(provider);
    },
  };
  (entry as any).register(api);
  expect(providers).toHaveLength(1);
  return providers[0];
}

const batchBoolean = {
  state: { foo: "bar" },
  questions: {
    q1: { type: "boolean", instructions: "Is it ok?", criteria: { true: "yes", false: "no" } },
  },
};

describe("openrouter-jev decision provider", () => {
  const envKey = process.env.OPENROUTER_JEV_API_KEY;
  const envFallback = process.env.OPENROUTER_API_KEY;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENROUTER_JEV_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (envKey === undefined) delete process.env.OPENROUTER_JEV_API_KEY;
    else process.env.OPENROUTER_JEV_API_KEY = envKey;
    if (envFallback === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = envFallback;
  });

  it("registers openrouter-jev and is ready", () => {
    const provider = collectProvider();
    expect(provider.id).toBe("openrouter-jev");
    expect(provider.isReady()).toBe(true);
  });

  it("returns credentials-unavailable without api key", async () => {
    const provider = collectProvider();
    const res = await provider.evaluate(batchBoolean, { model: "typesafe/jev-1.13" });
    expect(res).toEqual({ status: "unavailable", reason: "credentials-unavailable" });
  });

  it("returns unsupported-input for unknown question type", async () => {
    process.env.OPENROUTER_JEV_API_KEY = "test-key";
    const provider = collectProvider();
    const res = await provider.evaluate(
      { state: {}, questions: { q: { type: "weird" } } },
      { model: "typesafe/jev-1.13" },
    );
    expect(res).toEqual({ status: "unavailable", reason: "unsupported-input" });
  });

  it("posts to decisions endpoint and maps boolean answer", async () => {
    process.env.OPENROUTER_JEV_API_KEY = "test-key";
    const provider = collectProvider();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ model: "typesafe/jev-1.13", answers: { q1: { noul: 0.8 } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as any;

    const res = await provider.evaluate(batchBoolean, { model: "typesafe/jev-1.13" });
    expect(res.status).toBe("ok");
    expect(res.result.answers.q1).toEqual({ type: "boolean", probabilityTrue: 0.8 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("typesafe/jev-1.13");
    expect(body.questions.q1.type).toBe("noul");
  });

  it("maps jev-latest model id", async () => {
    process.env.OPENROUTER_JEV_API_KEY = "test-key";
    const provider = collectProvider();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ answers: { q1: { noul: 0.5 } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as any;

    await provider.evaluate(batchBoolean, { model: "jev-latest" });
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(body.model).toBe("~typesafe/jev-latest");
  });

  it("maps choice and score answers", async () => {
    process.env.OPENROUTER_JEV_API_KEY = "test-key";
    const provider = collectProvider();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          answers: {
            c: { choice: "a", probabilities: { a: 0.7, b: 0.3 }, confidence: 0.9 },
            s: { score: 4, probabilities: [0.1, 0.1, 0.1, 0.1, 0.6] },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as any;

    const res = await provider.evaluate(
      {
        state: null,
        questions: {
          c: { type: "choice", instructions: "pick", criteria: { a: "A", b: "B" } },
          s: { type: "score", instructions: "rate", criteria: ["bad", "ok", "good"] },
        },
      },
      { model: "typesafe/jev-1.13" },
    );
    expect(res.status).toBe("ok");
    expect(res.result.answers.c).toMatchObject({ type: "choice", choice: "a" });
    expect(res.result.answers.s).toMatchObject({ type: "score", score: 4 });
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(body.state).toEqual({ input: null });
  });

  it("maps http errors to unavailable reasons", async () => {
    process.env.OPENROUTER_JEV_API_KEY = "test-key";
    const provider = collectProvider();

    globalThis.fetch = (async () => new Response("{}", { status: 401 })) as any;
    expect((await provider.evaluate(batchBoolean, { model: "x" })).reason).toBe("authentication");

    globalThis.fetch = (async () => new Response("{}", { status: 400 })) as any;
    expect((await provider.evaluate(batchBoolean, { model: "x" })).reason).toBe("unsupported-input");

    globalThis.fetch = (async () => new Response("{}", { status: 500 })) as any;
    expect((await provider.evaluate(batchBoolean, { model: "x" })).reason).toBe("transport");

    globalThis.fetch = (async () => new Response("nope", { status: 200 })) as any;
    expect((await provider.evaluate(batchBoolean, { model: "x" })).reason).toBe("invalid-response");
  });
});
