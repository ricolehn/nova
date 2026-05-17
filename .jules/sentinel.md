## 2025-01-20 - Plaintext Password Exposure in API

**Vulnerability:** The `/api/admin/system-config` endpoint was returning the plaintext SMTP password as part of the system configuration object, exposing it to any authenticated admin user.
**Learning:** Returning unmasked secrets in generic configuration endpoints is a critical risk, even for admin endpoints. The frontend only needs to know *if* a password is set, not its actual value.
**Prevention:** Implement a masked-secret pattern:
1. In GET endpoints, replace the secret with a placeholder (e.g., `'***'`).
2. In PUT/POST endpoints, check if the incoming secret matches the placeholder. If it does, preserve the existing secret from the backend configuration instead of overwriting it with the placeholder.
