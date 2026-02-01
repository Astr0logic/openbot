import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { PassThrough } from "node:stream";
import { Notary } from "../notary/Notary.js";
import crypto from "node:crypto";

type ProxyOptions = {
    port?: number;
    target?: string;
    notary: Notary;
};

/**
 * "Notary" Gateway: A transparent, fail-open, zero-latency proxy.
 */
export class Gateway {
    private server: http.Server;
    private notary: Notary;
    private target: string;

    constructor(options: ProxyOptions) {
        // console.log("Gateway constructor options:", options);
        this.notary = options.notary;
        if (!this.notary) {
            throw new Error("Gateway requires a Notary instance");
        }
        this.target = options.target || "https://api.openai.com";

        this.server = http.createServer((req, res) => this.handle(req, res));
    }


    listen(port: number) {
        this.server.listen(port, () => {
            // console.log(`Gateway listening on ${port} -> ${this.target}`);
        });
        return this.server;
    }

    close() {
        this.server.close();
    }

    private handle(req: http.IncomingMessage, res: http.ServerResponse) {
        const start = Date.now();
        const targetUrl = new URL(this.target);
        const requestId = crypto.randomUUID();

        // FAIL-OPEN: If anything in capture logic fails, catch it and ignore
        let reqCapture: PassThrough | null = null;
        let resCapture: PassThrough | null = null;

        try {
            reqCapture = new PassThrough();
            resCapture = new PassThrough();
        } catch (e) {
            // Failed to init capture streams, proceed with direct proxying?
            // In minimal implementation, these shouldn't fail.
        }

        // --- Upstream Request ---
        const protocol = targetUrl.protocol === "http:" ? http : https;
        const port = targetUrl.port || (targetUrl.protocol === "http:" ? 80 : 443);

        const options: https.RequestOptions = {
            hostname: targetUrl.hostname,
            port: Number(port),
            path: req.url,
            method: req.method,
            headers: {
                ...req.headers,
                host: targetUrl.hostname, // Overwrite host
                "connection": "keep-alive"
            }
        };

        const upstreamReq = protocol.request(options, (upstreamRes) => {
            // Forward status/headers immediately (Zero Latency)
            res.writeHead(upstreamRes.statusCode ?? 500, upstreamRes.statusMessage, upstreamRes.headers);

            // Pipe response to Client AND Capture
            upstreamRes.pipe(res);
            if (resCapture) {
                upstreamRes.pipe(resCapture);
            }
        });

        upstreamReq.on("error", (err) => {
            // Upstream failed - this is a genuine connection error
            if (!res.headersSent) {
                res.writeHead(502);
                res.end();
            }
        });

        // --- Client Request ---
        // Pipe request to Upstream AND Capture
        req.pipe(upstreamReq);
        if (reqCapture) {
            req.pipe(reqCapture);
        }

        // --- Async Receipt Generation ---
        // Handle processing completely out-of-band
        this.processReceipt(requestId, req, reqCapture, resCapture, start);
    }

    private async processReceipt(
        id: string,
        req: http.IncomingMessage,
        reqStream: PassThrough | null,
        resStream: PassThrough | null,
        startTime: number
    ) {
        if (!reqStream || !resStream) return;

        const reqChunks: Buffer[] = [];
        const resChunks: Buffer[] = [];

        // Collect data asynchronously
        reqStream.on("data", c => reqChunks.push(c));
        resStream.on("data", c => resChunks.push(c));

        // Wait for response to finish
        await new Promise<void>(resolve => resStream.on("end", resolve));

        const latency = Date.now() - startTime;
        const reqBody = Buffer.concat(reqChunks).toString("utf8");
        const resBody = Buffer.concat(resChunks).toString("utf8");

        // Parse request body if possible (assume JSON)
        let prompt = "unknown";
        let model = undefined;
        try {
            const json = JSON.parse(reqBody);
            if (json.messages) {
                prompt = JSON.stringify(json.messages);
            } else if (json.prompt) {
                prompt = json.prompt;
            }
            if (json.model) model = json.model;
        } catch {
            prompt = reqBody; // Fallback to raw body
        }

        // Submit to Notary
        this.notary.notarize({
            prompt,
            response: resBody,
            latencyMs: latency,
            model,
            provider: "openai" // TODO: detect provider from URL or header
        });
    }
}

