/**
 * Plugin Marketplace Types
 *
 * Defines the structure for plugins that can be distributed
 * through the OpenBot plugin marketplace.
 */

/** Plugin pricing tier */
export type PluginTier = "free" | "paid" | "enterprise";

/** Plugin category */
export type PluginCategory =
  | "channel" // Messaging channels (Discord, Slack, etc.)
  | "mcp" // MCP server integrations
  | "tool" // Agent tools
  | "orchestration" // Multi-instance features
  | "security" // Auth, audit, compliance
  | "integration" // Third-party integrations
  | "utility"; // Misc utilities

/** Plugin manifest - lives in plugin's package.json under "openbot" key */
export type PluginManifest = {
  /** Unique plugin identifier (e.g., "jrl/orchestration-pro") */
  id: string;

  /** Display name */
  name: string;

  /** Short description (max 140 chars) */
  description: string;

  /** Long description (markdown) */
  readme?: string;

  /** Version (semver) */
  version: string;

  /** Plugin category */
  category: PluginCategory;

  /** Pricing tier */
  tier: PluginTier;

  /** Price in cents (0 for free) */
  priceUsdCents?: number;

  /** Author info */
  author: {
    name: string;
    email?: string;
    url?: string;
  };

  /** Repository URL */
  repository?: string;

  /** Homepage URL */
  homepage?: string;

  /** License (SPDX identifier) */
  license: string;

  /** Keywords for search */
  keywords?: string[];

  /** Minimum openbot version required */
  openbotVersion: string;

  /** Plugin entry point */
  main: string;

  /** TypeScript types entry point */
  types?: string;

  /** Required permissions */
  permissions?: PluginPermission[];

  /** Dependencies on other plugins */
  pluginDependencies?: Record<string, string>;

  /** Screenshots/images for marketplace listing */
  images?: string[];

  /** Changelog URL or inline */
  changelog?: string;
};

/** Plugin permissions */
export type PluginPermission =
  | "network" // Make HTTP requests
  | "filesystem" // Read/write files
  | "shell" // Execute shell commands
  | "env" // Access environment variables
  | "secrets" // Access stored credentials
  | "messages" // Read/send messages
  | "config" // Modify configuration
  | "hooks" // Register hooks
  | "tools" // Register agent tools
  | "channels"; // Register messaging channels

/** License key for paid plugins */
export type PluginLicense = {
  /** License key */
  key: string;

  /** Plugin ID this license is for */
  pluginId: string;

  /** License holder email */
  email: string;

  /** Issue timestamp */
  issuedAt: number;

  /** Expiry timestamp (0 = perpetual) */
  expiresAt: number;

  /** License tier */
  tier: "individual" | "team" | "enterprise";

  /** Max seats (for team/enterprise) */
  seats?: number;

  /** Signature for verification */
  signature: string;
};

/** Installed plugin record */
export type InstalledPlugin = {
  manifest: PluginManifest;
  installedAt: number;
  updatedAt: number;
  enabled: boolean;
  license?: PluginLicense;
  path: string;
};

/** Plugin registry entry (from marketplace API) */
export type RegistryPlugin = {
  manifest: PluginManifest;
  downloads: number;
  rating: number;
  reviewCount: number;
  publishedAt: number;
  updatedAt: number;
  verified: boolean;
  featured: boolean;
};

/** Search filters */
export type PluginSearchFilters = {
  query?: string;
  category?: PluginCategory;
  tier?: PluginTier;
  minRating?: number;
  verified?: boolean;
  featured?: boolean;
  sort?: "downloads" | "rating" | "updated" | "name";
  limit?: number;
  offset?: number;
};
