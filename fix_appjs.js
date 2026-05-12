const fs = require('fs');

let appJs = fs.readFileSync('assets/app.js', 'utf8');

// The error states:
// aria-label="Bearbeiten"> was replaced with aria-label=window.t("Bearbeiten")>
// This means the replacer replaced `"Bearbeiten"` with `window.t("Bearbeiten")` literally inside an HTML string, so it ended up like `aria-label=window.t("Bearbeiten")>` instead of `aria-label="${window.t("Bearbeiten")}">`.
// Oh, the original was aria-label="Bearbeiten", meaning the quotes were around the whole thing.
// And our string replaced `"{escapedKey}"` with `window.t("{key}")`. So `aria-label=window.t("Bearbeiten")>` is missing quotes around the attribute and missing the `${}` template literal interpolation.

// Let's reset assets/app.js to the state before the regex replacements and do it carefully.
