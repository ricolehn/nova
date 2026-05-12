const fs = require('fs');

let appJs = fs.readFileSync('assets/app.js', 'utf8');
appJs = appJs.replace(/\* @param \{Date\} \[preCalcPaidUntil\] \- Optional: Vorberechnetes window\.t\("Bezahlt bis"\) Datum/g, '* @param {Date} [preCalcPaidUntil] - Optional: Vorberechnetes "Bezahlt bis" Datum');
fs.writeFileSync('assets/app.js', appJs);
