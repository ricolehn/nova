## 2024-05-08 - Secure Cookie Transmission
**Vulnerability:** Authentication cookies were missing the `Secure` flag.
**Learning:** In a mixed environment (local dev vs HTTPS prod), cookies must dynamically assess connection security (e.g., using `req.secure` in Express with `trust proxy` enabled).
**Prevention:** Always configure session/auth cookies to utilize the `Secure` flag dynamically based on the request protocol (`req.secure`).
