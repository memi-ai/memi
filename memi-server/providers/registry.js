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
  for (const [name, provider] of providers) {
    if (provider.detect && provider.detect(b, m)) return provider;
  }
  return providers.get("openai");
}

function loadBuiltinProviders() {
  const builtins = ["openai", "gemini", "anthropic", "groq", "cohere"];
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
