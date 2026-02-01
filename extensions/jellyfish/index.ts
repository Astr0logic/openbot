import type { OpenClawPluginApi } from "../../src/plugins/types.js";
import { createJellyfishTool } from "./src/jellyfish-tool.js";

export default function register(api: OpenClawPluginApi) {
  api.registerTool(
    (ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createJellyfishTool(api);
    },
    { optional: true },
  );
}
