const fs = require('fs');
let html = fs.readFileSync('setup.html', 'utf8');
// Fix duplicate initI18n in setup.html
html = html.replace(/<script>\s*window\.initI18n\(\);\s*<\/script>\s*<script>\s*window\.initI18n\(\);\s*<\/script>/g, '<script>\n    window.initI18n();\n</script>');
fs.writeFileSync('setup.html', html);
