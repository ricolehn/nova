## 2026-04-17 - Replaced Array.reduce with a for loop
**Learning:** Using `Array.prototype.reduce` introduces callback overhead. Pre-allocating local variables and using classic `for` loops minimizes CPU overhead for hot-path data aggregations.
**Action:** Replaced `reduce()` with traditional `for` loops when calculating arrays.
