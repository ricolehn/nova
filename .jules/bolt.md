## 2024-05-14 - Search Filtering Inefficiency
**Learning:** `filterPeople` and `filterHistory` search filters in the UI use `document.querySelectorAll` and iterate over all DOM elements triggering layout/style recalculations (`style.display = 'block' | 'none'`) synchronously on every keypress. There's no debouncing.
**Action:** Add a simple debounce function to prevent blocking the main thread and excessive DOM manipulations while typing.
