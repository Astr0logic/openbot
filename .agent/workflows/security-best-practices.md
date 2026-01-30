---
description: Security best practices and utilities for the OpenClaw codebase
---

# Security Best Practices

This document outlines security utilities and patterns used in the OpenClaw codebase.

## Credential Storage

### macOS
- Uses system Keychain via `security` CLI
- See `cli-credentials.ts` for keychain read/write functions

### Linux/Windows
- Uses encrypted file storage (`src/infra/encrypted-file.ts`)
- AES-256-GCM encryption with PBKDF2 key derivation
- Set `OPENCLAW_ENCRYPTION_KEY` env var for enhanced security

## Sensitive Data Handling

### DO:
- Use `saveEncryptedFile()` for credential/token storage
- Use `crypto.timingSafeEqual()` for secret comparison
- Use `crypto.randomUUID()` for unique identifiers
- Set restrictive file permissions (`0o600` for files, `0o700` for dirs)

### DON'T:
- Store API keys in plaintext config files
- Log secrets or tokens (use redaction in `ws-log.ts`)
- Compare secrets with `===` (timing attacks)

## Security Audit

Run the built-in security audit:
```bash
openclaw security audit --deep
```

This checks:
- File permissions on config/state directories
- Gateway authentication configuration
- Channel security settings

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENCLAW_ENCRYPTION_KEY` | Master key for file encryption |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway authentication token |
| `OPENCLAW_GATEWAY_PASSWORD` | Gateway password authentication |

## Related Files

- `src/infra/encrypted-file.ts` - Encryption utilities
- `src/agents/cli-credentials.ts` - Credential management
- `src/security/audit.ts` - Security audit implementation
- `src/security/fix.ts` - Security issue remediation
