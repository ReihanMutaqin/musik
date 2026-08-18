const DEFAULT_MODEL = "openrouter/free";

export function getModelCandidates() {
  const primary = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  const configured = (process.env.OPENROUTER_FALLBACK_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return [...new Set([primary, ...configured])].slice(0, 4);
}
