// Jellyfish palette tokens for CLI/UI theming. Bioluminescent ocean vibes.
// JRL - Jellyfish Research Labs
export const JELLYFISH_PALETTE = {
  accent: "#00D4FF", // Bioluminescent cyan
  accentBright: "#00F5FF", // Bright cyan glow
  accentDim: "#0099CC", // Deep ocean cyan
  info: "#7B68EE", // Medium purple (jellyfish tentacles)
  success: "#00FF88", // Bioluminescent green
  warn: "#FFB347", // Soft orange (moon jelly)
  error: "#FF6B9D", // Pink (some jellyfish species)
  muted: "#6B8E9F", // Ocean gray-blue
} as const;

// Legacy alias for compatibility
export const LOBSTER_PALETTE = JELLYFISH_PALETTE;
