/**
 * OpenBot Plugin Marketplace
 *
 * A plugin ecosystem for distributing free and paid OpenBot extensions.
 *
 * Features:
 * - Plugin discovery and search
 * - Installation and updates
 * - License verification for paid plugins
 * - Permission management
 *
 * Usage:
 *   # CLI
 *   openbot plugins search "mcp"
 *   openbot plugins install jrl/orchestration-pro --license KEY
 *   openbot plugins list
 *
 *   # Programmatic
 *   import { createPluginRegistry } from "./marketplace/index.js";
 *
 *   const registry = await createPluginRegistry();
 *   const plugins = await registry.search({ category: "mcp" });
 *   await registry.install("jrl/mcp-github");
 */

// Registry
export {
  PluginRegistry,
  createPluginRegistry,
  getDefaultPluginsDir,
  type PluginRegistryOptions,
} from "./registry.js";

// Types
export type {
  PluginManifest,
  PluginLicense,
  PluginTier,
  PluginCategory,
  PluginPermission,
  InstalledPlugin,
  RegistryPlugin,
  PluginSearchFilters,
} from "./types.js";
