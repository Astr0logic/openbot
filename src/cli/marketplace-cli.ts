/**
 * Nexus CLI - Agent Marketplace
 * Bot-agnostic registry for plugins, skills, souls, and services
 */

import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { defaultRuntime } from "../runtime.js";
import { renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";

// Path to local Nexus registry (relative to workspace root)
const NEXUS_REGISTRY_PATH = "packages/nexus-registry/registry.json";

// Future: Remote registry URL
// const REMOTE_REGISTRY_URL = "https://marketplace.openbot.cloud/registry.json";

export interface MarketplaceItem {
  id: string;
  type: "plugin" | "skill" | "soul" | "config" | "service";
  name: string;
  description: string;
  version: string;
  compatibility: {
    openclaw?: { verified: boolean; tested_version?: string };
    openbot?: { verified: boolean; tested_version?: string };
    [key: string]: { verified: boolean; tested_version?: string } | undefined;
  };
  security: {
    verified: boolean;
    verified_by?: string;
    honeypot_clean?: boolean;
  };
  pricing: {
    model: "one_time" | "subscription";
    amount: number;
    currency: string;
    purchase_url?: string;
  } | null;
  author: {
    id: string;
    name: string;
    verified: boolean;
  };
  tags: string[];
  manifest_url: string;
  install_count: number;
  license: string;
}

export interface MarketplaceRegistry {
  version: string;
  items: MarketplaceItem[];
  categories: { id: string; name: string; description: string }[];
  supported_bots: { id: string; name: string; min_version: string }[];
}

function loadLocalRegistry(): MarketplaceRegistry | null {
  // Try to find registry relative to cwd or from workspace root
  const paths = [
    path.join(process.cwd(), NEXUS_REGISTRY_PATH),
    path.join(process.cwd(), "../../", NEXUS_REGISTRY_PATH),
  ];

  for (const registryPath of paths) {
    if (fs.existsSync(registryPath)) {
      try {
        const content = fs.readFileSync(registryPath, "utf-8");
        return JSON.parse(content);
      } catch {
        continue;
      }
    }
  }
  return null;
}

function formatItemType(type: string): string {
  switch (type) {
    case "plugin":
      return theme.command("plugin");
    case "skill":
      return theme.success("skill");
    case "soul":
      return theme.warn("soul");
    case "config":
      return theme.muted("config");
    case "service":
      return theme.error("service");
    default:
      return type;
  }
}

function formatCompatibility(item: MarketplaceItem): string {
  const badges: string[] = [];
  for (const [botId, info] of Object.entries(item.compatibility)) {
    if (info?.verified) {
      badges.push(theme.success(`✓${botId}`));
    }
  }
  return badges.join(" ");
}

function formatPrice(item: MarketplaceItem): string {
  if (!item.pricing) return theme.success("Free");
  const { amount, currency, model } = item.pricing;
  const suffix = model === "subscription" ? "/mo" : "";
  return `$${amount}${suffix}`;
}

export function registerMarketplaceCli(program: Command) {
  const nexus = program
    .command("nexus")
    .alias("nx")
    .description("Browse Nexus - the agent marketplace");

  nexus
    .command("search")
    .description("Search for plugins, skills, souls, and more")
    .argument("[query]", "Search query")
    .option("-t, --type <type>", "Filter by type (plugin, skill, soul, config, service)")
    .option("--bot <bot>", "Filter by bot compatibility (openclaw, openbot)")
    .option("--verified", "Only show verified items", false)
    .option("--free", "Only show free items", false)
    .option("--json", "Output as JSON")
    .action(
      (
        query: string | undefined,
        opts: {
          type?: string;
          bot?: string;
          verified?: boolean;
          free?: boolean;
          json?: boolean;
        },
      ) => {
        const registry = loadLocalRegistry();
        if (!registry) {
          defaultRuntime.error("Nexus registry not found.");
          defaultRuntime.log(theme.muted("Looking for: " + NEXUS_REGISTRY_PATH));
          process.exit(1);
        }

        let items = registry.items;

        // Filter by query
        if (query) {
          const q = query.toLowerCase();
          items = items.filter(
            (item) =>
              item.name.toLowerCase().includes(q) ||
              item.description.toLowerCase().includes(q) ||
              item.tags.some((t) => t.toLowerCase().includes(q)),
          );
        }

        // Filter by type
        if (opts.type) {
          items = items.filter((item) => item.type === opts.type);
        }

        // Filter by bot compatibility
        if (opts.bot) {
          const botKey = opts.bot;
          items = items.filter((item) => item.compatibility[botKey]?.verified === true);
        }

        // Filter verified only
        if (opts.verified) {
          items = items.filter((item) => item.security.verified);
        }

        // Filter free only
        if (opts.free) {
          items = items.filter((item) => !item.pricing);
        }

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(items, null, 2));
          return;
        }

        if (items.length === 0) {
          defaultRuntime.log(theme.muted("No items found."));
          return;
        }

        defaultRuntime.log(theme.heading(`Marketplace`) + theme.muted(` (${items.length} items)`));
        defaultRuntime.log("");

        const tableWidth = Math.max(80, (process.stdout.columns ?? 120) - 1);
        const rows = items.map((item) => ({
          Name: item.name,
          Type: formatItemType(item.type),
          Price: formatPrice(item),
          Compat: formatCompatibility(item),
          Description:
            item.description.length > 40 ? item.description.slice(0, 37) + "..." : item.description,
        }));

        defaultRuntime.log(
          renderTable({
            width: tableWidth,
            columns: [
              { key: "Name", header: "Name", minWidth: 16, flex: true },
              { key: "Type", header: "Type", minWidth: 8 },
              { key: "Price", header: "Price", minWidth: 8 },
              { key: "Compat", header: "Compat", minWidth: 14 },
              { key: "Description", header: "Description", minWidth: 20, flex: true },
            ],
            rows,
          }).trimEnd(),
        );
      },
    );

  nexus
    .command("info")
    .description("Show detailed info about a marketplace item")
    .argument("<id>", "Item ID")
    .option("--json", "Output as JSON")
    .action((id: string, opts: { json?: boolean }) => {
      const registry = loadLocalRegistry();
      if (!registry) {
        defaultRuntime.error("Nexus registry not found.");
        process.exit(1);
      }

      const item = registry.items.find((i) => i.id === id);
      if (!item) {
        defaultRuntime.error(`Item not found: ${id}`);
        process.exit(1);
      }

      if (opts.json) {
        defaultRuntime.log(JSON.stringify(item, null, 2));
        return;
      }

      const lines: string[] = [];
      lines.push(theme.heading(item.name));
      lines.push(theme.muted(`ID: ${item.id}`));
      lines.push("");
      lines.push(item.description);
      lines.push("");
      lines.push(`${theme.muted("Type:")} ${formatItemType(item.type)}`);
      lines.push(`${theme.muted("Version:")} ${item.version}`);
      lines.push(`${theme.muted("Price:")} ${formatPrice(item)}`);
      lines.push(`${theme.muted("License:")} ${item.license}`);
      lines.push("");
      lines.push(`${theme.muted("Compatibility:")} ${formatCompatibility(item)}`);
      lines.push(
        `${theme.muted("Security:")} ${item.security.verified ? theme.success("Verified") : theme.warn("Unverified")}`,
      );
      if (item.security.verified_by) {
        lines.push(`${theme.muted("Verified by:")} ${item.security.verified_by}`);
      }
      lines.push("");
      lines.push(
        `${theme.muted("Author:")} ${item.author.name}${item.author.verified ? theme.success(" ✓") : ""}`,
      );
      lines.push(`${theme.muted("Tags:")} ${item.tags.join(", ")}`);

      if (item.pricing?.purchase_url) {
        lines.push("");
        lines.push(`${theme.muted("Purchase:")} ${item.pricing.purchase_url}`);
      }

      lines.push("");
      lines.push(`${theme.muted("Install:")} openbot plugins install ${item.id}`);

      defaultRuntime.log(lines.join("\n"));
    });

  nexus
    .command("categories")
    .description("List available categories")
    .action(() => {
      const registry = loadLocalRegistry();
      if (!registry) {
        defaultRuntime.error("Nexus registry not found.");
        process.exit(1);
      }

      defaultRuntime.log(theme.heading("Categories"));
      defaultRuntime.log("");
      for (const cat of registry.categories) {
        defaultRuntime.log(`${theme.command(cat.id)} - ${cat.description}`);
      }
    });

  nexus
    .command("bots")
    .description("List supported bots/platforms")
    .action(() => {
      const registry = loadLocalRegistry();
      if (!registry) {
        defaultRuntime.error("Nexus registry not found.");
        process.exit(1);
      }

      defaultRuntime.log(theme.heading("Supported Bots"));
      defaultRuntime.log("");
      for (const bot of registry.supported_bots) {
        defaultRuntime.log(
          `${theme.success("✓")} ${theme.command(bot.id)} - ${bot.name} (min: ${bot.min_version})`,
        );
      }
    });
}
