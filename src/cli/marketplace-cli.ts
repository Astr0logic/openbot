/**
 * Marketplace CLI - Commands for plugin management.
 *
 * Commands:
 *   openbot plugins search    - Search marketplace
 *   openbot plugins install   - Install a plugin
 *   openbot plugins uninstall - Remove a plugin
 *   openbot plugins list      - List installed plugins
 *   openbot plugins update    - Update plugins
 *   openbot plugins enable    - Enable a plugin
 *   openbot plugins disable   - Disable a plugin
 *   openbot plugins license   - Activate a license
 */

import type { Command } from "commander";

export function registerMarketplaceCli(program: Command): void {
  const plugins = program.command("plugins").description("Plugin marketplace");

  // Aliases
  plugins.alias("plugin").alias("market");

  // openbot plugins search
  plugins
    .command("search [query]")
    .description("Search the plugin marketplace")
    .option("--category <cat>", "Filter by category")
    .option("--tier <tier>", "Filter by tier (free, paid, enterprise)")
    .option("--featured", "Show featured plugins only")
    .option("--verified", "Show verified plugins only")
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
      const { createPluginRegistry } = await import("../marketplace/registry.js");
      const registry = await createPluginRegistry({ log: () => {} });

      try {
        const results = await registry.search({
          query,
          category: options.category,
          tier: options.tier,
          featured: options.featured,
          verified: options.verified,
          limit: 20,
        });

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        if (results.length === 0) {
          console.log("No plugins found.");
          return;
        }

        console.log(`Found ${results.length} plugins:\n`);

        for (const plugin of results) {
          const tier =
            plugin.manifest.tier === "free"
              ? "FREE"
              : plugin.manifest.tier === "paid"
                ? `$${((plugin.manifest.priceUsdCents ?? 0) / 100).toFixed(0)}`
                : "ENTERPRISE";

          const verified = plugin.verified ? " ✓" : "";
          const featured = plugin.featured ? " ★" : "";

          console.log(`  ${plugin.manifest.id}${verified}${featured}`);
          console.log(`    ${plugin.manifest.description}`);
          console.log(
            `    ${tier} | ${plugin.manifest.category} | ↓${plugin.downloads} | ★${plugin.rating.toFixed(1)}`,
          );
          console.log();
        }
      } catch (err) {
        console.error(`Search failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // openbot plugins install
  plugins
    .command("install <pluginId>")
    .description("Install a plugin from the marketplace")
    .option("--license <key>", "License key for paid plugins")
    .action(async (pluginId, options) => {
      const { createPluginRegistry } = await import("../marketplace/registry.js");
      const registry = await createPluginRegistry({ log: console.log });

      try {
        const installed = await registry.install(pluginId, options.license);
        console.log(`\nInstalled ${installed.manifest.name} v${installed.manifest.version}`);

        if (installed.manifest.permissions?.length) {
          console.log(`\nPermissions granted:`);
          for (const perm of installed.manifest.permissions) {
            console.log(`  - ${perm}`);
          }
        }

        console.log(`\nRestart openbot to load the plugin.`);
      } catch (err) {
        console.error(`Install failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // openbot plugins uninstall
  plugins
    .command("uninstall <pluginId>")
    .description("Uninstall a plugin")
    .action(async (pluginId) => {
      const { createPluginRegistry } = await import("../marketplace/registry.js");
      const registry = await createPluginRegistry({ log: console.log });

      const success = await registry.uninstall(pluginId);
      if (success) {
        console.log(`Uninstalled ${pluginId}`);
      } else {
        console.error(`Plugin not found: ${pluginId}`);
        process.exit(1);
      }
    });

  // openbot plugins list
  plugins
    .command("list")
    .description("List installed plugins")
    .option("--json", "Output as JSON")
    .option("--enabled", "Show only enabled plugins")
    .action(async (options) => {
      const { createPluginRegistry } = await import("../marketplace/registry.js");
      const registry = await createPluginRegistry({ log: () => {} });

      const plugins = options.enabled ? registry.getEnabled() : registry.getAllInstalled();

      if (options.json) {
        console.log(JSON.stringify(plugins, null, 2));
        return;
      }

      if (plugins.length === 0) {
        console.log("No plugins installed.");
        console.log("\nRun 'openbot plugins search' to find plugins.");
        return;
      }

      console.log(`Installed plugins (${plugins.length}):\n`);

      for (const plugin of plugins) {
        const status = plugin.enabled ? "●" : "○";
        const licensed = plugin.license
          ? " [licensed]"
          : plugin.manifest.tier !== "free"
            ? " [unlicensed]"
            : "";

        console.log(`  ${status} ${plugin.manifest.id} v${plugin.manifest.version}${licensed}`);
        console.log(`    ${plugin.manifest.description}`);
        console.log(`    Category: ${plugin.manifest.category} | Tier: ${plugin.manifest.tier}`);
        console.log();
      }
    });

  // openbot plugins update
  plugins
    .command("update [pluginId]")
    .description("Update plugins (all or specific)")
    .option("--license <key>", "License key for paid updates")
    .action(async (pluginId, options) => {
      const { createPluginRegistry } = await import("../marketplace/registry.js");
      const registry = await createPluginRegistry({ log: console.log });

      if (pluginId) {
        // Update specific plugin
        const plugin = registry.getInstalled(pluginId);
        if (!plugin) {
          console.error(`Plugin not found: ${pluginId}`);
          process.exit(1);
        }

        try {
          await registry.uninstall(pluginId);
          await registry.install(pluginId, options.license ?? plugin.license?.key);
          console.log(`Updated ${pluginId}`);
        } catch (err) {
          console.error(`Update failed: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      } else {
        // Check all for updates
        console.log("Checking for updates...\n");
        const updates = await registry.checkUpdates();

        if (updates.length === 0) {
          console.log("All plugins are up to date.");
          return;
        }

        console.log(`Found ${updates.length} updates:\n`);
        for (const { plugin, latest } of updates) {
          console.log(`  ${plugin.manifest.id}: ${plugin.manifest.version} → ${latest}`);
        }

        console.log(`\nRun 'openbot plugins update <pluginId>' to update.`);
      }
    });

  // openbot plugins enable
  plugins
    .command("enable <pluginId>")
    .description("Enable a plugin")
    .action(async (pluginId) => {
      const { createPluginRegistry } = await import("../marketplace/registry.js");
      const registry = await createPluginRegistry({ log: () => {} });

      const success = await registry.setEnabled(pluginId, true);
      if (success) {
        console.log(`Enabled ${pluginId}`);
      } else {
        console.error(`Plugin not found: ${pluginId}`);
        process.exit(1);
      }
    });

  // openbot plugins disable
  plugins
    .command("disable <pluginId>")
    .description("Disable a plugin")
    .action(async (pluginId) => {
      const { createPluginRegistry } = await import("../marketplace/registry.js");
      const registry = await createPluginRegistry({ log: () => {} });

      const success = await registry.setEnabled(pluginId, false);
      if (success) {
        console.log(`Disabled ${pluginId}`);
      } else {
        console.error(`Plugin not found: ${pluginId}`);
        process.exit(1);
      }
    });

  // openbot plugins license
  plugins
    .command("license <pluginId> <key>")
    .description("Activate a license for a plugin")
    .action(async (pluginId, key) => {
      const { createPluginRegistry } = await import("../marketplace/registry.js");
      const registry = await createPluginRegistry({ log: () => {} });

      const success = await registry.activateLicense(pluginId, key);
      if (success) {
        console.log(`License activated for ${pluginId}`);
      } else {
        console.error(
          `Failed to activate license. Check that the plugin is installed and the key is valid.`,
        );
        process.exit(1);
      }
    });

  // openbot plugins info
  plugins
    .command("info <pluginId>")
    .description("Show detailed plugin information")
    .option("--json", "Output as JSON")
    .action(async (pluginId, options) => {
      const { createPluginRegistry } = await import("../marketplace/registry.js");
      const registry = await createPluginRegistry({ log: () => {} });

      // Check if installed locally
      const installed = registry.getInstalled(pluginId);

      // Fetch from registry
      try {
        const remote = await registry.getPlugin(pluginId);

        if (options.json) {
          console.log(JSON.stringify({ installed, remote }, null, 2));
          return;
        }

        if (!remote && !installed) {
          console.error(`Plugin not found: ${pluginId}`);
          process.exit(1);
        }

        const manifest = remote?.manifest ?? installed?.manifest;
        if (!manifest) {
          console.error(`Plugin not found: ${pluginId}`);
          process.exit(1);
        }

        console.log(`\n${manifest.name} (${manifest.id})`);
        console.log("=".repeat(40));
        console.log(`\n${manifest.description}\n`);

        console.log(`Version:    ${manifest.version}`);
        console.log(`Category:   ${manifest.category}`);
        console.log(`Tier:       ${manifest.tier}`);
        if (manifest.priceUsdCents) {
          console.log(`Price:      $${(manifest.priceUsdCents / 100).toFixed(2)}`);
        }
        console.log(`License:    ${manifest.license}`);
        console.log(`Author:     ${manifest.author.name}`);
        if (manifest.repository) {
          console.log(`Repository: ${manifest.repository}`);
        }

        if (remote) {
          console.log(`\nMarketplace Stats:`);
          console.log(`  Downloads: ${remote.downloads}`);
          console.log(`  Rating:    ${remote.rating.toFixed(1)} (${remote.reviewCount} reviews)`);
          console.log(`  Verified:  ${remote.verified ? "Yes" : "No"}`);
          console.log(`  Featured:  ${remote.featured ? "Yes" : "No"}`);
        }

        if (installed) {
          console.log(`\nInstalled:`);
          console.log(`  Status:  ${installed.enabled ? "Enabled" : "Disabled"}`);
          console.log(`  Path:    ${installed.path}`);
          console.log(`  License: ${installed.license ? "Active" : "None"}`);
        } else {
          console.log(`\nNot installed. Run 'openbot plugins install ${pluginId}' to install.`);
        }

        if (manifest.permissions?.length) {
          console.log(`\nRequired Permissions:`);
          for (const perm of manifest.permissions) {
            console.log(`  - ${perm}`);
          }
        }
      } catch (err) {
        if (installed) {
          // Show local info if registry unavailable
          console.log(`\n${installed.manifest.name} (local)`);
          console.log(`Version: ${installed.manifest.version}`);
          console.log(`Status:  ${installed.enabled ? "Enabled" : "Disabled"}`);
        } else {
          console.error(
            `Failed to fetch plugin info: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(1);
        }
      }
    });
}
