import { SecureAI, Gateway, EncryptedFileStorage, Notary } from "../src/index.js";

// 1. Setup Encrypted Storage
const storage = new EncryptedFileStorage(
  "./encrypted-receipts.enc",
  "super-secret-password-or-env-var"
);

// 2. Initialize Notary (The Auditor)
const notary = new Notary({
  storage: storage,
  provider: "openai",
  model: "gpt-4-turbo"
});

// 3. Initialize Gateway (The Proxy)
const gateway = new Gateway({
  notary,
  target: "https://api.openai.com"
});

// 4. (Optional) Initialize Client if you want to use the SDK programmatically too
const secureAI = new SecureAI({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY || "sk-dummy-key",
  storage: storage,
  model: "gpt-4-turbo"
});

// 4. Start Listening
const PORT = 3000;
gateway.listen(PORT);

console.log(`🔒 Secure AI Gateway listening on port ${PORT}`);
console.log(`📝 Encrypted receipts will be written to ./encrypted-receipts.enc`);
console.log(`\nTry sending a request:\n`);
console.log(`curl http://localhost:${PORT}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello, secure world!"}]
  }'`);
