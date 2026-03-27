## 2024-03-27 - [Backend Data Hydration Loop Optimization]
**Learning:** Native `reduce` operations combined with nested object access create significant CPU overhead during bulk data hydration in Express route handlers.
**Action:** Replace `Array.prototype.reduce()` with pre-allocated local variables and classic `for` loops for high-frequency utility functions like `calculateTotalPaid` and `groupRecordsBy` to reduce blocking execution time.
