/**
 * Model display name mapping and tier classification.
 *
 * GitHub Copilot usage metrics return internal model identifiers.
 * This utility maps them to human-friendly display names and classifies
 * models into "included" or "premium" tiers for reporting.
 */

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // OpenAI models
  "gpt-3.5-turbo": "GPT-3.5 Turbo",
  "gpt-4": "GPT-4",
  "gpt-4-turbo": "GPT-4 Turbo",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini",
  "gpt-4.1": "GPT-4.1",
  "gpt-4.1-mini": "GPT-4.1 Mini",
  "gpt-4.1-nano": "GPT-4.1 Nano",
  "o1": "o1",
  "o1-mini": "o1 Mini",
  "o1-preview": "o1 Preview",
  "o3": "o3",
  "o3-mini": "o3 Mini",
  "o4-mini": "o4 Mini",

  // Anthropic models
  "claude-3.5-sonnet": "Claude 3.5 Sonnet",
  "claude-3.5-haiku": "Claude 3.5 Haiku",
  "claude-4.0-sonnet": "Claude 4.0 Sonnet",
  "claude-4.6-sonnet": "Claude 4.6 Sonnet",
  "claude-opus-4.6": "Claude Opus 4.6",

  // Google models
  "gemini-1.5-pro": "Gemini 1.5 Pro",
  "gemini-1.5-flash": "Gemini 1.5 Flash",
  "gemini-2.0-flash": "Gemini 2.0 Flash",
  "gemini-2.5-pro": "Gemini 2.5 Pro",

  // GitHub / default
  "default": "Default",
  "copilot-default": "Copilot Default",
};

/**
 * Models classified as "premium" that consume premium request quota.
 * Models not in this set are treated as "included".
 */
const PREMIUM_MODELS = new Set([
  "gpt-4",
  "gpt-4-turbo",
  "gpt-4.1",
  "o1",
  "o1-mini",
  "o1-preview",
  "o3",
  "o3-mini",
  "o4-mini",
  "claude-3.5-sonnet",
  "claude-4.0-sonnet",
  "claude-4.6-sonnet",
  "claude-opus-4.6",
  "gemini-1.5-pro",
  "gemini-2.5-pro",
]);

/**
 * Get the display-friendly name for a model.
 * Returns the original name with improved formatting if no mapping exists.
 */
export function modelDisplayName(rawName: string): string {
  const lower = rawName.toLowerCase().trim();
  if (MODEL_DISPLAY_NAMES[lower]) return MODEL_DISPLAY_NAMES[lower];

  // Fallback: capitalize each segment
  return rawName
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

/**
 * Check if a model is classified as "premium".
 */
export function isPremiumModel(rawName: string): boolean {
  return PREMIUM_MODELS.has(rawName.toLowerCase().trim());
}

/**
 * Get the tier label for a model.
 */
export function modelTier(rawName: string): "premium" | "included" {
  return isPremiumModel(rawName) ? "premium" : "included";
}
