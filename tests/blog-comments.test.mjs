import assert from "node:assert/strict";
import test from "node:test";
import { createBlogCommentsHandler } from "../netlify/functions/blog-comments.mjs";

function createMemoryStore() {
  const values = new Map();
  return {
    async get(key) {
      return values.has(key) ? structuredClone(values.get(key)) : null;
    },
    async list({ prefix }) {
      return {
        blobs: Array.from(values.keys())
          .filter((key) => key.startsWith(prefix))
          .map((key) => ({ key })),
      };
    },
    async setJSON(key, value) {
      values.set(key, structuredClone(value));
    },
  };
}

function makeRequest(method, slug = "seo-basics", payload) {
  const url = `https://example.netlify.app/.netlify/functions/blog-comments?slug=${slug}`;
  if (payload === undefined) return new Request(url, { method });
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

test("publishes valid comments and returns them for the same article", async () => {
  const store = createMemoryStore();
  const handler = createBlogCommentsHandler(() => store);
  const response = await handler(
    makeRequest("POST", "seo-basics", { name: "A Reader", comment: "Helpful article!" }),
    { ip: "192.0.2.10" },
  );

  assert.equal(response.status, 201);
  assert.equal((await response.json()).message, "Your comment is now public.");

  const listResponse = await handler(makeRequest("GET"), { ip: "192.0.2.10" });
  const result = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(result.comments.length, 1);
  assert.equal(result.comments[0].name, "A Reader");
  assert.equal(result.comments[0].comment, "Helpful article!");
  assert.ok(result.comments[0].createdAt);
});

test("rejects invalid articles, malformed payloads, and oversized comments", async () => {
  const handler = createBlogCommentsHandler(createMemoryStore);
  assert.equal((await handler(makeRequest("GET", "unknown"), {})).status, 400);
  assert.equal((await handler(makeRequest("POST", "seo-basics", "{"), {})).status, 400);
  assert.equal((await handler(makeRequest("POST", "seo-basics", null), {})).status, 400);
  assert.equal(
    (await handler(makeRequest("POST", "seo-basics", {
      name: "Reader",
      comment: "x".repeat(2001),
    }), { ip: "192.0.2.11" })).status,
    400,
  );
});

test("honeypot submissions are not published and commenters are rate limited", async () => {
  const store = createMemoryStore();
  const handler = createBlogCommentsHandler(() => store);
  const spamResponse = await handler(
    makeRequest("POST", "seo-basics", { name: "Spam", comment: "Spam comment", website: "spam.example" }),
    { ip: "192.0.2.12" },
  );
  assert.equal(spamResponse.status, 201);
  assert.equal((await (await handler(makeRequest("GET"), {})).json()).comments.length, 0);

  for (let index = 0; index < 5; index += 1) {
    const response = await handler(
      makeRequest("POST", "seo-basics", { name: "Reader", comment: `Valid comment ${index}` }),
      { ip: "192.0.2.13" },
    );
    assert.equal(response.status, 201);
  }
  const limitedResponse = await handler(
    makeRequest("POST", "seo-basics", { name: "Reader", comment: "One more comment" }),
    { ip: "192.0.2.13" },
  );
  assert.equal(limitedResponse.status, 429);
});
