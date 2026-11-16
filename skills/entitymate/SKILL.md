---
name: entitymate
description: Use when working with Entitymate collections, cacheBy indexes, entity behavior, related collections, loading, or rollback.
---

Use `collection(rows)` for ordered records and declare reusable domain methods in `options.methods`. For per-record getters and methods, pass `context => entity(behavior)` as the second argument and pass options third. Use `EntityBehavior<ReturnType<typeof factory>>` to infer the behavior type from a named factory. See [SPEC.md](../../SPEC.md) for exact semantics and [README.md](../../README.md) for examples.

- Treat `_id` as the collection key. Preserve generated IDs on export with `{ ...item._current, _id: item._id }`. Use `set` or `load` for a full replacement that retains matching instances. Use `reorder(ids)` for an order-only change that preserves snapshots.
- Use `cacheBy: { sku: { unique: true }, 'details.categoryId': {} }` to declare a unique lookup and a grouped lookup. `getBy('sku', sku)` returns an item or `undefined`. `getBy('details.categoryId', id).findBy('details.brand', brand)` searches only the live group, including when it is empty.
- Starting in 0.4.0, use `each((item, id, index) => …)` for side effects and `map((item, id, index) => …)` to build an array from a collection or group. `id` is `_id`. Pass `{ sortBy: [['createdAt', 'asc'], ['name', 'desc']] }` to apply criteria in array order. The index follows the traversal order. Use `sort(compare)` for a sorted array of live entities and `reorder(ids)` to change collection order.
- For repeated projections, pass `{ cache: 'name', deps: [locale] }` to `map` or `sort`. Use a stable key per computation, list external inputs in `deps`, and retain the group view for cache reuse. Cached results are shallow-frozen arrays. Return `item._current` from a projection when you need an independent snapshot.
- Change tracked fields through `update(item._id, { details: nextDetails })`. Patches are shallow. The collection checks unique indexes before applying the patch. `rollback(item._id)` restores one prior snapshot. Reading `_raw`, `_current`, or `_previous` returns a copy, so read `context.row` in entity getters that only need a field.
- Read related collections through `context.relations`. Read UI metadata from `context.meta`. Keep getters synchronous and await `load` at the operation that needs fresh data. Use `derive` for read-only views of related sources and call `dispose()` when a derived collection is no longer needed.
- In a workflow action, call the collection operation and return its result. Keep sequencing in the workflow. For transport or storage, project the result to its `_current` data and `_id`.
