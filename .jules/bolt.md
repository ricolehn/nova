
## $(date +%Y-%m-%d) - [Bypass Native Date Parsing for ISO Strings in Loops]
**Learning:** Instantiating `new Date(isoString)` inside large loops for basic month/year extraction adds significant V8 parser overhead. However, relying purely on string length (`length >= 10`) to identify ISO dates is a fragile anti-pattern that can cause severe regression bugs if an alternative format like `MM/DD/YYYY` happens to be exactly 10 characters long.
**Action:** When implementing fast-path string slicing optimizations for dates (e.g., `parseInt(date.substring(...))`), strictly validate the string format using a Regex (like `/^\d{4}-\d{2}-\d{2}/`) to guarantee safety and prevent silent calculation corruption.
