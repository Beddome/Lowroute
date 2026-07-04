---
name: Drizzle raw sql ANY(array) → malformed array literal
description: Interpolating a JS array into raw sql ANY() crashes; use inArray().
---

`db.execute(sql\`... WHERE id = ANY(${userIds})\`)` where `userIds` is a JS string[] throws Postgres `22P02 malformed array literal` — drizzle expands an interpolated array into a comma list of placeholders, so `ANY($1)` receives a bare scalar, not a Postgres array.

**Why:** Drizzle's `sql` template treats an embedded JS array as a placeholder list (meant for `IN (...)`), which is incompatible with `ANY(<array>)`.

**How to apply:** For membership checks against an id list, use the query builder: `inArray(table.col, ids)` (combine with `isNotNull(...)` etc. via `and(...)`). Avoid raw `ANY(${jsArray})`. If you truly need raw SQL, cast explicitly, e.g. `ANY(${sql.raw(...)}::text[])`.
