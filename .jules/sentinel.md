## 2024-05-08 - Secure Cookie Transmission
**Vulnerability:** Authentication cookies were missing the `Secure` flag.
**Learning:** In a mixed environment (local dev vs HTTPS prod), cookies must dynamically assess connection security (e.g., using `req.secure` in Express with `trust proxy` enabled).
**Prevention:** Always configure session/auth cookies to utilize the `Secure` flag dynamically based on the request protocol (`req.secure`).
## 2026-05-09 - Prevent XSS in inline onclick event handlers
**Vulnerability:** XSS in inline `onclick` strings
**Learning:** When generating HTML elements with inline JavaScript event handlers (`onclick`), passing variables via string interpolation even with `escapeHtml` is unsafe. Browsers decode HTML entities (like `&#039;`) in attributes *before* executing the inline JavaScript, which means an attacker can escape the string and execute arbitrary code.
**Prevention:** Avoid inline string interpolation for event parameters. Instead, safely store data in `data-*` attributes (using `escapeHtml`) and pass `this.dataset.propertyName` within the `onclick` handler.
