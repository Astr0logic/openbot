import { loadEncryptedFile, ReceiptChain, type Receipt } from "../src/index.js";
import fs from "node:fs";

async function main() {
    const filePath = process.argv[2];
    const key = process.env.OPENCLAW_ENCRYPTION_KEY;

    if (!filePath) {
        console.error("Usage: npx tsx examples/verify-chain.ts <file-path>");
        process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }

    if (!key) {
        console.warn("⚠️  Warning: OPENCLAW_ENCRYPTION_KEY not set. Using machine-derived key.");
    }

    console.log(`🔓 Decrypting ${filePath}...`);
    const data = loadEncryptedFile(filePath, { encryptionKey: key });

    if (!data) {
        console.error("❌ Failed to decrypt file. Wrong key or corrupted data.");
        process.exit(1);
    }

    if (!Array.isArray(data)) {
        console.error("❌ Invalid format: Expected array of receipts.");
        process.exit(1);
    }

    const receipts = data as Receipt[];
    console.log(`📄 Found ${receipts.length} receipts.`);

    const chain = new ReceiptChain();
    let passed = true;

    for (let i = 0; i < receipts.length; i++) {
        try {
            chain.append(receipts[i]);
            process.stdout.write(".");
        } catch (e) {
            console.log("\n");
            console.error(`❌ Integrity Check Failed at receipt #${i + 1} (${receipts[i].receipt_id})`);
            console.error(`   Error: ${(e as Error).message}`);
            passed = false;
            break;
        }
    }

    console.log("\n");

    if (passed) {
        if (receipts.length > 0) {
            console.log("✅ CHAIN VERIFIED");
            console.log(`   Start: ${receipts[0].timestamp_utc}`);
            console.log(`   End:   ${receipts[receipts.length - 1].timestamp_utc}`);
            console.log(`   Hash:  ${chain.getLastHash()}`);
        } else {
            console.log("⚠️  Chain is empty.");
        }
    } else {
        console.error("⛔️ COMPROMISED: The receipt chain is invalid.");
        process.exit(1);
    }
}

main().catch(console.error);
