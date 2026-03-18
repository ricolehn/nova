## 2024-05-18 - Admin Panel XSS via Unescaped User Registration Data
**Vulnerability:** XSS in the "Nicht zugeordnete Benutzer" admin panel list. User registration fields (`firstName`, `lastName`, `email`) were rendered directly to `innerHTML` without HTML escaping.
**Learning:** Even internal or admin-only interfaces must sanitize user-provided data. The lack of validation on registration combined with direct DOM injection created a stored XSS vector.
**Prevention:** Always use the `escapeHtml()` utility function when dynamically rendering user-supplied strings into the DOM via template literals.
