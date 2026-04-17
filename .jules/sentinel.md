## 2026-04-17 - Stored XSS in Request Details
**Vulnerability:** User-submitted request fields (notes, descriptions, rejection reasons, status) were rendered directly into the HTML without sanitization, leading to Stored XSS.
**Learning:** In a vanilla JS application relying on innerHTML or template strings, every piece of user-provided data must be escaped. This app's admin view could be compromised by an unprivileged user submitting a malicious request containing script tags.
**Prevention:** Always use escapeHtml() when interpolating external data into template strings that are later assigned to innerHTML.
