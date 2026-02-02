/**
 * Plugin Registry - Manages installed plugins and marketplace interactions.
 */

import { createHash, createVerify } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  InstalledPlugin,
  PluginLicense,
  PluginManifest,
  PluginSearchFilters,
  RegistryPlugin,
} from "./types.js";

/** Default marketplace API URL */
const DEFAULT_REGISTRY_URL = "https://plugins.openbot.ai/api/v1";

/** Public key for license verification (placeholder - replace with real key) */
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----`;

export type PluginRegistryOptions = {
  /** Plugin installation directory */
  pluginsDir: string;
  /** Marketplace API URL */
  registryUrl?: string;
  /** Log function */
  log?: (msg: string) => void;
};

export class PluginRegistry {
  private pluginsDir: string;
  private registryUrl: string;
  private log: (msg: string) => void;
  private installed = new Map<string, InstalledPlugin>();
  private licensesPath: string;

  constructor(options: PluginRegistryOptions) {
    this.pluginsDir = options.pluginsDir;
    this.registryUrl = options.registryUrl ?? DEFAULT_REGISTRY_URL;
    this.log = options.log ?? (() => {});
    this.licensesPath = path.join(this.pluginsDir, ".licenses.json");
  }

  /**
   * Initialize registry - load installed plugins.
   */
  async init(): Promise<void> {
    await fs.mkdir(this.pluginsDir, { recursive: true });
    await this.loadInstalled();
    this.log(`[registry] initialized with ${this.installed.size} plugins`);
  }

  /**
   * Search marketplace for plugins.
   */
  async search(filters: PluginSearchFilters = {}): Promise<RegistryPlugin[]> {
    const params = new URLSearchParams();
    if (filters.query) params.set("q", filters.query);
    if (filters.category) params.set("category", filters.category);
    if (filters.tier) params.set("tier", filters.tier);
    if (filters.minRating) params.set("minRating", String(filters.minRating));
    if (filters.verified) params.set("verified", "true");
    if (filters.featured) params.set("featured", "true");
    if (filters.sort) params.set("sort", filters.sort);
    if (filters.limit) params.set("limit", String(filters.limit));
    if (filters.offset) params.set("offset", String(filters.offset));

    const res = await fetch(`${this.registryUrl}/plugins?${params}`);
    if (!res.ok) {
      throw new Error(`Registry search failed: ${res.status}`);
    }

    const data = await res.json();
    return data.plugins as RegistryPlugin[];
  }

  /**
   * Get plugin details from marketplace.
   */
  async getPlugin(pluginId: string): Promise<RegistryPlugin | null> {
    const res = await fetch(`${this.registryUrl}/plugins/${encodeURIComponent(pluginId)}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Failed to fetch plugin: ${res.status}`);
    }
    return (await res.json()) as RegistryPlugin;
  }

  /**
   * Install a plugin from the marketplace.
   */
  async install(pluginId: string, licenseKey?: string): Promise<InstalledPlugin> {
    this.log(`[registry] installing ${pluginId}...`);

    // Fetch plugin info
    const plugin = await this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    // Check if paid plugin requires license
    if (plugin.manifest.tier === "paid" || plugin.manifest.tier === "enterprise") {
      if (!licenseKey) {
        throw new Error(
          `Plugin ${pluginId} requires a license key. Purchase at ${this.registryUrl}/plugins/${pluginId}`,
        );
      }

      const license = await this.verifyLicense(pluginId, licenseKey);
      if (!license) {
        throw new Error(`Invalid license key for ${pluginId}`);
      }
    }

    // Download plugin tarball
    const tarballUrl = `${this.registryUrl}/plugins/${encodeURIComponent(pluginId)}/download`;
    const res = await fetch(tarballUrl, {
      headers: licenseKey ? { Authorization: `License ${licenseKey}` } : {},
    });

    if (!res.ok) {
      throw new Error(`Failed to download plugin: ${res.status}`);
    }

    // Extract to plugins directory
    const pluginDir = path.join(this.pluginsDir, pluginId.replace("/", "-"));
    await fs.mkdir(pluginDir, { recursive: true });

    // For now, assume JSON response with files (real impl would use tarball)
    const data = await res.json();
    for (const [filePath, content] of Object.entries(data.files as Record<string, string>)) {
      const fullPath = path.join(pluginDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    }

    // Read manifest
    const manifestPath = path.join(pluginDir, "package.json");
    const manifestRaw = await fs.readFile(manifestPath, "utf-8");
    const pkg = JSON.parse(manifestRaw);
    const manifest = pkg.openbot as PluginManifest;

    // Store license if provided
    let license: PluginLicense | undefined;
    if (licenseKey) {
      license = await this.verifyLicense(pluginId, licenseKey);
      if (license) {
        await this.storeLicense(pluginId, license);
      }
    }

    // Record installation
    const installed: InstalledPlugin = {
      manifest,
      installedAt: Date.now(),
      updatedAt: Date.now(),
      enabled: true,
      license,
      path: pluginDir,
    };

    this.installed.set(pluginId, installed);
    await this.saveInstalled();

    this.log(`[registry] installed ${pluginId}@${manifest.version}`);
    return installed;
  }

  /**
   * Uninstall a plugin.
   */
  async uninstall(pluginId: string): Promise<boolean> {
    const plugin = this.installed.get(pluginId);
    if (!plugin) return false;

    this.log(`[registry] uninstalling ${pluginId}...`);

    // Remove plugin directory
    await fs.rm(plugin.path, { recursive: true, force: true });

    // Remove from registry
    this.installed.delete(pluginId);
    await this.saveInstalled();

    this.log(`[registry] uninstalled ${pluginId}`);
    return true;
  }

  /**
   * Enable/disable a plugin.
   */
  async setEnabled(pluginId: string, enabled: boolean): Promise<boolean> {
    const plugin = this.installed.get(pluginId);
    if (!plugin) return false;

    plugin.enabled = enabled;
    await this.saveInstalled();

    this.log(`[registry] ${pluginId} ${enabled ? "enabled" : "disabled"}`);
    return true;
  }

  /**
   * Get installed plugin.
   */
  getInstalled(pluginId: string): InstalledPlugin | undefined {
    return this.installed.get(pluginId);
  }

  /**
   * Get all installed plugins.
   */
  getAllInstalled(): InstalledPlugin[] {
    return Array.from(this.installed.values());
  }

  /**
   * Get enabled plugins.
   */
  getEnabled(): InstalledPlugin[] {
    return this.getAllInstalled().filter((p) => p.enabled);
  }

  /**
   * Check for plugin updates.
   */
  async checkUpdates(): Promise<Array<{ plugin: InstalledPlugin; latest: string }>> {
    const updates: Array<{ plugin: InstalledPlugin; latest: string }> = [];

    for (const plugin of this.installed.values()) {
      try {
        const remote = await this.getPlugin(plugin.manifest.id);
        if (remote && remote.manifest.version !== plugin.manifest.version) {
          updates.push({ plugin, latest: remote.manifest.version });
        }
      } catch {
        // Skip plugins that can't be checked
      }
    }

    return updates;
  }

  /**
   * Verify a license key.
   */
  async verifyLicense(pluginId: string, licenseKey: string): Promise<PluginLicense | null> {
    try {
      // Decode license (base64 JSON + signature)
      const [dataB64, signatureB64] = licenseKey.split(".");
      if (!dataB64 || !signatureB64) return null;

      const data = JSON.parse(Buffer.from(dataB64, "base64").toString("utf-8"));
      const signature = Buffer.from(signatureB64, "base64");

      // Verify signature
      const verify = createVerify("SHA256");
      verify.update(dataB64);
      const valid = verify.verify(LICENSE_PUBLIC_KEY, signature);

      if (!valid) return null;

      // Check plugin ID matches
      if (data.pluginId !== pluginId) return null;

      // Check expiry
      if (data.expiresAt > 0 && data.expiresAt < Date.now()) return null;

      return data as PluginLicense;
    } catch {
      return null;
    }
  }

  /**
   * Activate a license for an installed plugin.
   */
  async activateLicense(pluginId: string, licenseKey: string): Promise<boolean> {
    const plugin = this.installed.get(pluginId);
    if (!plugin) return false;

    const license = await this.verifyLicense(pluginId, licenseKey);
    if (!license) return false;

    plugin.license = license;
    await this.storeLicense(pluginId, license);
    await this.saveInstalled();

    this.log(`[registry] license activated for ${pluginId}`);
    return true;
  }

  /**
   * Load installed plugins from disk.
   */
  private async loadInstalled(): Promise<void> {
    const registryPath = path.join(this.pluginsDir, ".registry.json");
    try {
      const data = await fs.readFile(registryPath, "utf-8");
      const plugins = JSON.parse(data) as InstalledPlugin[];
      for (const plugin of plugins) {
        // Verify plugin still exists
        try {
          await fs.access(plugin.path);
          this.installed.set(plugin.manifest.id, plugin);
        } catch {
          // Plugin directory missing, skip
        }
      }
    } catch {
      // No registry file yet
    }

    // Load licenses
    try {
      const data = await fs.readFile(this.licensesPath, "utf-8");
      const licenses = JSON.parse(data) as Record<string, PluginLicense>;
      for (const [pluginId, license] of Object.entries(licenses)) {
        const plugin = this.installed.get(pluginId);
        if (plugin) {
          plugin.license = license;
        }
      }
    } catch {
      // No licenses file yet
    }
  }

  /**
   * Save installed plugins to disk.
   */
  private async saveInstalled(): Promise<void> {
    const registryPath = path.join(this.pluginsDir, ".registry.json");
    const plugins = Array.from(this.installed.values());
    await fs.writeFile(registryPath, JSON.stringify(plugins, null, 2));
  }

  /**
   * Store license to disk.
   */
  private async storeLicense(pluginId: string, license: PluginLicense): Promise<void> {
    let licenses: Record<string, PluginLicense> = {};
    try {
      const data = await fs.readFile(this.licensesPath, "utf-8");
      licenses = JSON.parse(data);
    } catch {
      // No licenses file yet
    }
    licenses[pluginId] = license;
    await fs.writeFile(this.licensesPath, JSON.stringify(licenses, null, 2));
  }
}

/**
 * Get default plugins directory.
 */
export function getDefaultPluginsDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return path.join(home, ".openbot", "plugins");
}

/**
 * Create a plugin registry with default options.
 */
export async function createPluginRegistry(
  options: Partial<PluginRegistryOptions> = {},
): Promise<PluginRegistry> {
  const registry = new PluginRegistry({
    pluginsDir: options.pluginsDir ?? getDefaultPluginsDir(),
    registryUrl: options.registryUrl,
    log: options.log,
  });
  await registry.init();
  return registry;
}
