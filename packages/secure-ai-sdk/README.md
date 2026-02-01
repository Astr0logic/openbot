# Secure AI SDK (MVP)

A zero-latency, drop-in SDK for generating immutable audit receipts for AI API calls.

This SDK observes AI interactions without changing behavior, latency, or output.

## What This Is

- A notarization layer for AI calls
- A drop-in replacement for native LLM clients
- An append-only receipt generator
- Fail-open by design

## What This Is Not

- Not a policy engine
- Not a filter
- Not a dashboard
- Not an AI framework

## Why It Exists

Teams ship bots and AI features fast. Auditability is added later—often too late.

This SDK ensures every AI interaction is:
- Timestamped
- Hash-verifiable
- Independently recorded

Without slowing anything down.

## Installation

```bash
npm install secure-ai-sdk
```

## Quick Start (Bot Example)

```ts
import { SecureAI } from "secure-ai-sdk";

const ai = new SecureAI({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
  botId: "example-bot",
  botVersion: "0.1.0",
});

const result = await ai.run("Explain append-only logs.");
console.log(result);
```

## Guarantees

- No blocking on receipt emission
- SDK failure does not block inference
- No behavioral changes to AI output

## Receipts

Each call produces a JSON receipt containing:

- Hashes of request and response
- High-precision timestamp
- Model + provider metadata
- Integrity chaining

Receipts are append-only and tamper-evident.

## Receipt Schema

```ts
interface Receipt {
  receipt_id: string;
  timestamp_utc: string;
  provider: string;
  model: string;
  request_hash: string;
  response_hash: string;
  latency_ms: number;
  bot_id?: string;
  bot_version?: string;
  previous_receipt_hash?: string;
}
```

## Status

MVP. Features:

- **Client SDK**: Drop-in wrapper for OpenAI.
- **Notary Gateway**: Observe-only transparent proxy.
- **Encrypted Storage**: AES-256-GCM logs at rest.
- **Verification Tool**: CLI for auditing receipt chains.

## Advanced Usage

### 1. Encrypted "Notary" Gateway

The SDK includes a transparent proxy server that sits between your app and the AI provider. It intercepts requests, logs encrypted receipts, and forwards traffic with zero latency.

```ts
import { SecureAI, Gateway, EncryptedFileStorage, Notary } from "secure-ai-sdk";

// 1. Setup Encrypted Storage
const storage = new EncryptedFileStorage(
  "./receipts.enc",
  process.env.OPENBOT_ENCRYPTION_KEY // Optional: defaults to machine-key
);

// 2. Initialize Notary
const notary = new Notary({
  storage,
  provider: "openai",
  model: "gpt-4-turbo"
});

// 3. Start Gateway
const gateway = new Gateway({ notary });
gateway.listen(3000);
```

### 2. Verification

Verify the integrity of your encrypted logs using the included CLI tool:

```bash
# Verify logs
npx tsx examples/verify-chain.ts ./receipts.enc
```

Output:
```
✅ CHAIN VERIFIED
   Start: 2026-01-30T12:00:00Z
   End:   2026-01-30T12:05:00Z
   Hash:  e0...3c
```

Designed to expand without breaking API surface.

## License

MIT (SDK only).
