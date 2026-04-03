## 2024-05-24 - Array.prototype.reduce overhead
**Learning:** In Node.js backend processing, Array.prototype.reduce() causes noticeable overhead in hot-path data aggregations/hydrations over large arrays compared to classic for loops. This overhead was demonstrated in benchmarks taking ~20-30% more execution time.
**Action:** Avoid using Array.prototype.reduce() for hot-path data aggregations/hydrations. Instead, pre-allocate local variables and use classic for loops to minimize CPU overhead and reduce blocking execution time.
