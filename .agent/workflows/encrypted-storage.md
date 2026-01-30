---
description: How to use the encrypted file utilities for secure credential storage
---

# Encrypted File Utilities

This project includes encryption utilities for storing sensitive data at rest, located in `src/infra/encrypted-file.ts`.

## Overview

The encryption module provides AES-256-GCM authenticated encryption with:
- PBKDF2 key derivation (100,000 iterations)
- Per-file random salt (16 bytes) and IV (12 bytes)
- Machine-specific key binding for local security

## Available Functions

### `saveEncryptedFile(pathname, data, options?)`
Encrypt and save JSON data to a file.

```typescript
import { saveEncryptedFile } from "../infra/encrypted-file.js";

saveEncryptedFile("/path/to/credentials.enc", {
  accessToken: "secret-token",
  refreshToken: "refresh-token",
  expiresAt: Date.now() + 3600000
});
```

### `loadEncryptedFile(pathname, options?)`
Load and decrypt a previously encrypted file.

```typescript
import { loadEncryptedFile } from "../infra/encrypted-file.js";

const data = loadEncryptedFile("/path/to/credentials.enc");
// Returns undefined if file doesn't exist or decryption fails
```

### `isEncryptedFile(pathname)`
Check if a file is encrypted (starts with our version byte).

### `migrateToEncrypted(pathname, options?)`
Convert a plaintext JSON file to encrypted format.

## Key Management

The encryption key is derived from (in priority order):
1. `OPENCLAW_ENCRYPTION_KEY` environment variable (recommended for production)
2. Machine-specific identifiers (hostname, homedir, platform, etc.)

You can also pass an explicit key:
```typescript
saveEncryptedFile(path, data, { encryptionKey: "custom-key" });
loadEncryptedFile(path, { encryptionKey: "custom-key" });
```

## File Format

```
[VERSION: 1 byte] [SALT: 16 bytes] [IV: 12 bytes] [AUTH_TAG: 16 bytes] [CIPHERTEXT]
```

## Security Notes

- Files are created with `0o600` permissions (owner read/write only)
- Parent directories are created with `0o700` permissions
- Each file uses a unique salt and IV, so identical data produces different ciphertext
- Decryption failures (wrong key, corrupted data) return `undefined` instead of throwing

## Integration with Credentials

The `cli-credentials.ts` module uses these utilities for non-macOS credential storage:
- Reads check for encrypted format first, falls back to plaintext
- Writes always use encrypted format
- Automatic migration from plaintext to encrypted on first read

## Tests

Run the encryption tests:
```bash
pnpm vitest run src/infra/encrypted-file.test.ts
```
