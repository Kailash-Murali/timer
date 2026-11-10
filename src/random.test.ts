import assert from "node:assert/strict";
import { test } from "node:test";
import { rollRandom } from "./random";

test("Random.org request uses the required range and commits the plain response", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://www.random.org");
    assert.equal(url.searchParams.get("min"), "10");
    assert.equal(url.searchParams.get("max"), "40");
    assert.equal(url.searchParams.get("num"), "1");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
    return new Response("17\n");
  };
  try {
    assert.deepEqual(await rollRandom(0), { value: 17, source: "RANDOM_ORG" });
  } finally {
    globalThis.fetch = original;
  }
});

test("rate limits, network errors, and invalid payloads use an in-range crypto fallback", async () => {
  const original = globalThis.fetch;
  const responses = [
    async () => new Response("rate limit", { status: 429 }),
    async (): Promise<Response> => {
      throw new TypeError("Failed to fetch");
    },
    async () => new Response("10garbage"),
    async () => new Response("41"),
    async () => new Response("10.1"),
    async () => new Response(""),
  ];
  try {
    for (const respond of responses) {
      globalThis.fetch = respond;
      const result = await rollRandom(0);
      assert.equal(result.source, "CRYPTO");
      assert.ok(Number.isInteger(result.value) && result.value >= 10 && result.value <= 40);
    }
  } finally {
    globalThis.fetch = original;
  }
});
