import path from "node:path";
import { Notary, EncryptedFileStorage } from "secure-ai-sdk";
import { OpenBotConfig as Config } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("notary");

type NotaryMode = "off" | "observe" | "enforce";

export type NotaryContext = {
  mode: NotaryMode;
  failOpen: boolean;
};

export class GatewayNotary {
  private notary: Notary | null = null;
  private mode: NotaryMode = "off";
  private failOpen: boolean = true;
  private storagePath: string;

  constructor(cfg: Config, storageRoot: string) {
    this.mode = (cfg.gateway?.notary?.mode as NotaryMode) || "off";
    this.failOpen = cfg.gateway?.notary?.failOpen ?? true;
    this.storagePath = path.join(storageRoot, "notary");

    if (this.mode !== "off") {
      this.init();
    }
  }

  private init() {
    const key = process.env.OPENBOT_ENCRYPTION_KEY;
    if (!key) {
      log.warn("OPENBOT_ENCRYPTION_KEY not set. Notary disabled despite config.");
      this.mode = "off";
      return;
    }

    try {
      // Ensure directory exists (Notary/Storage usually handles this, but good to be safe)
      const storage = new EncryptedFileStorage(this.storagePath, key);
      // We use a dummy 'system' client ID for the gateway itself for now
      this.notary = new Notary(storage, "gateway-system");
      log.info(`Notary initialized in ${this.mode} mode at ${this.storagePath}`);
    } catch (err) {
      log.error(`Failed to initialize Notary: ${err}`);
      this.mode = "off";
    }
  }

  async process(req: any, res: any): Promise<void> {
    if (this.mode === "off" || !this.notary) return;

    // In a real middleware, we'd capture the actual request/response body.
    // For this implementation, we'll create a receipt based on metadata
    // effectively "notarizing" the fact that a request occurred.

    const receiptPromise = this.signTransaction(req, res);

    if (this.mode === "enforce") {
      try {
        await receiptPromise;
      } catch (err) {
        log.error(`Notary enforcement failed: ${err}`);
        if (!this.failOpen) {
          throw new Error("Notary verification failed and fail-open is disabled.");
        }
      }
    } else {
      // Observe mode: fire and forget (but log errors)
      receiptPromise.catch((err) => {
        log.warn(`Notary observation failed: ${err}`);
      });
    }
  }

  private async signTransaction(req: any, res: any) {
    if (!this.notary) return;

    // Construct a payload representing the interaction
    const payload = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      clientIp: req.ip || req.socket?.remoteAddress,
      // In future iterations, we can pipe the body streams here
      meta: "Gateway transaction",
    };

    await this.notary.sign(payload);
  }
}

export function createGatewayNotary(cfg: Config, storageRoot: string): GatewayNotary {
  return new GatewayNotary(cfg, storageRoot);
}
