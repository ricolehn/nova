## 2024-05-13 - [Fix Privilege Escalation]
**Vulnerability:** Ordinary admins could update `admin` and `superAdmin` fields on other users, allowing them to escalate privileges or modify super admin settings.
**Learning:** `writeLogicalPath` had insufficient checks for field modification authorization compared to the specific endpoints protected by `verifySuperAdmin`.
**Prevention:** Check target user's `superAdmin` status before modifying them, and restrict setting `admin` and `superAdmin` flags to users that possess `superAdmin` rights themselves.
