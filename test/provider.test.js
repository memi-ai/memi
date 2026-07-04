const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");

const registry = require(path.resolve(__dirname, "..", "memi-server", "providers", "registry"));
registry.loadBuiltinProviders();

describe("Provider Registry", () => {
  it("loads all builtin providers", () => {
    const names = registry.listProviders();
    const expected = ["openai", "gemini", "anthropic", "groq", "cohere", "perplexity", "nvidia", "cloudflare", "localai"];
    for (const n of expected) {
      assert.ok(names.includes(n), `provider ${n} should be registered`);
    }
  });

  it("detects OpenAI by baseUrl", () => {
    const p = registry.detectProvider("https://api.openai.com/v1", "gpt-4o");
    assert.equal(p.name, "openai");
  });

  it("detects Gemini by model prefix", () => {
    const p = registry.detectProvider("https://example.com/v1", "gemini-2.0-flash");
    assert.equal(p.name, "gemini");
  });

  it("detects Anthropic by baseUrl", () => {
    const p = registry.detectProvider("https://api.anthropic.com/v1", "claude-sonnet");
    assert.equal(p.name, "anthropic");
  });

  it("detects Groq by baseUrl", () => {
    const p = registry.detectProvider("https://api.groq.com/openai/v1", "llama-3.3-70b");
    assert.equal(p.name, "groq");
  });

  it("detects Cohere by baseUrl", () => {
    const p = registry.detectProvider("https://api.cohere.ai/v1", "command-r-plus");
    assert.equal(p.name, "cohere");
  });

  it("detects Perplexity by baseUrl", () => {
    const p = registry.detectProvider("https://api.perplexity.ai", "sonar");
    assert.equal(p.name, "perplexity");
  });

  it("detects NVIDIA by baseUrl", () => {
    const p = registry.detectProvider("https://integrate.api.nvidia.com/v1", "llama");
    assert.equal(p.name, "nvidia");
  });

  it("detects Cloudflare by model prefix", () => {
    const p = registry.detectProvider("https://api.cloudflare.com/v1", "@cf/meta/llama");
    assert.equal(p.name, "cloudflare");
  });

  it("detects LocalAI by localhost", () => {
    const p = registry.detectProvider("http://localhost:8080/v1", "model");
    assert.equal(p.name, "localai");
  });

  it("falls back to openai for unknown", () => {
    const p = registry.detectProvider("https://unknown.example.com/v1", "custom-model");
    assert.equal(p.name, "openai");
  });

  it("getProvider returns correct module", () => {
    const p = registry.getProvider("openai");
    assert.ok(p);
    assert.equal(typeof p.chat, "function");
    assert.equal(typeof p.detect, "function");
  });

  it("getProvider throws for unknown", () => {
    assert.throws(() => registry.getProvider("nonexistent"), /Unknown provider/);
  });
});
