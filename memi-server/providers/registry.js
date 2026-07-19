const path = require("path");
const fs = require("fs");

const providers = new Map();

function register(name, provider) {
  providers.set(name.toLowerCase(), provider);
}

function getProvider(name) {
  const p = providers.get(name.toLowerCase());
  if (!p) throw new Error(`Unknown provider: ${name}`);
  return p;
}

function listProviders() {
  return Array.from(providers.keys());
}

function detectProvider(baseUrl, model) {
  const b = (baseUrl || "").toLowerCase();
  const m = (model || "").toLowerCase();
  let fallback = null;
  for (const [name, provider] of providers) {
    if (!provider.detect) continue;
    if (provider.detect(b, m)) {
      // If openai matches as fallback, remember it but keep looking
      if (name === "openai") { fallback = provider; continue; }
      return provider; // specific match wins immediately
    }
  }
  return fallback || providers.get("openai");
}

function loadBuiltinProviders() {
  const builtins = ["openai", "gemini", "anthropic", "groq", "cohere", "perplexity", "nvidia", "cloudflare", "localai", "xfyun"];
  for (const name of builtins) {
    try {
      const mod = require(`./${name}`);
      if (mod && mod.name) register(mod.name, mod);
    } catch (e) {
      console.warn(`[provider] Failed to load ${name}: ${e.message}`);
    }
  }
}

module.exports = { register, getProvider, listProviders, detectProvider, loadBuiltinProviders };
