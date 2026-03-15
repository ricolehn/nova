
## 2024-05-24 - Unrestricted File Uploads via Multer
**Vulnerability:** The `/api/upload` endpoint for receipts allowed any file type (including `.html`, `.sh`) and had no file size limit because `multer` was configured only with a `storage` engine.
**Learning:** By default, Express/Multer does not enforce file size constraints or type validation. Statically serving these uploaded files via `res.sendFile()` implicitly trusts the unvalidated extension, enabling Stored XSS. Additionally, omitting `limits.fileSize` introduces a DoS risk by allowing disk space exhaustion.
**Prevention:** Always configure `multer` with a `fileFilter` to strictly whitelist allowed MIME types and extensions. Always define `limits: { fileSize: MAX_BYTES }`. Always wrap `upload.single()` inside the route handler rather than as top-level middleware to securely catch and format `multer` errors without leaking stack traces.

## 2024-05-24 - Unauthenticated Access to Invite Code
**Vulnerability:** The `/api/db` endpoint handled by `readLogicalPath` exposed `system/inviteCode` without requiring any authentication. Because the frontend fetched this code to validate it client-side during registration, an attacker could arbitrarily retrieve the invite code required to create new accounts, completely bypassing registration controls.
**Learning:** Client-side validation of security tokens or invite codes undermines their purpose because the secret must be sent to the untrusted client. Furthermore, hardcoding a path bypass in a generic data-fetching route (like `readLogicalPath`) can inadvertently expose sensitive data to all unauthenticated visitors.
**Prevention:** Always validate invite codes and security tokens exclusively on the server side during the registration/action attempt. Ensure that all data access paths explicitly enforce the principle of least privilege, requiring at minimum valid authentication, and for sensitive data (like invite codes), administrative privileges.
