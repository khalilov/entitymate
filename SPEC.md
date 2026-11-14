# Entitymate

Entitymate is a TypeScript library for ordered in-memory collections of domain entities. The package must work the same way on the server and in the browser.

## Use cases

| Use case                            | Collection requirements                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Chunk registry                      | Unique IDs, lookup by ID and by coordinate key within a world version, loading, and record projection for the manifest. |
| Players, game objects, and sessions | Lookup by ID and stable secondary keys, ordered iteration, and predictable insertion, replacement, and removal.         |
| Client chunks and remote players    | Lookup, replacement, and removal with stable object identity. The application releases Three.js resources.              |

Movement command FIFOs, render queues, and snapshot buffers have their own ordering and lifetime rules and are outside the first release. The application owns files, sockets, GPU resources, and workflow orchestration.

## Public API

The package exports the `collection` and `entity` factories. The collection owns order, indexes, and loading. Each entity stores snapshots and prepares record changes. The collection applies those changes after checking the indexes.

`collection(rows, behavior?, options?)` accepts plain objects and class instances and preserves their identity and prototypes. The second argument is a behavior factory with a typed context. Pass `undefined` for behavior when supplying options alone. `entity({...})` preserves method and getter descriptors. `EntityBehavior<ReturnType<typeof factory>>` extracts the behavior type from the factory result. `options.methods` adds collection methods, `config` holds application settings, and `relations` supplies other collection instances. The collection passes `meta` by reference to the context. Use it for application metadata such as UI settings. It defaults to `undefined`.

The collection uses a string `_id` if present, falls back to a string `id`, then generates an ID with Nano ID. It defines `_id` on the original object as an own, enumerable, non-writable property. Persist the snapshot and key as `{ ...item._current, _id: item._id }`. `get`, `require`, `update`, `rollback`, and `remove` use `_id`. `add` rejects duplicates. `upsert` updates a matching record in place or appends a new one. `set` reconciles by key, sets the new order, and preserves matching instances.

`rows` returns a frozen array in collection order. Iteration and search follow that order, and `total` counts the rows. `get` and `remove` return `undefined` for a missing key. `require` and `update` throw. `rollback` returns `undefined` if the key is missing or the record has no previous snapshot. `clear` is equivalent to `set([])`.

Input arrays must be dense. Collection creation, `set`, and loading reject duplicate IDs, repeated object references, and unique-index conflicts before applying changes to rows or indexes. An existing key can appear once in the input and will match the existing record.

`reorder(ids)` takes every current `_id` in the new order. It rejects missing, unknown, and duplicate keys before changing the collection. It preserves instances and snapshots, updates group order, and notifies subscribers. Derived collections reject this operation.

`indexOf(id)` returns the zero-based position in `rows` or `-1` when absent. `snapshot(ids = [])` returns a null-prototype dictionary of independent current snapshots keyed by `_id`, with `_id` included in each value. An empty list selects all records. A non-empty list skips unknown IDs and uses each matching ID once.

## Record state

- `_raw` is the snapshot from first insertion. `_current` is the current snapshot. `_previous` is the snapshot from before the last successful `update` or `upsert`.
- Reading a snapshot returns an independent copy of the record's own enumerable data properties. Class methods stay on the prototype and private state stays on the instance. Rollback covers record data. Record fields must support structured cloning and updates via property descriptors. The contract excludes proxies and enumerable accessors. The record must accept metadata on first insertion and belongs to one collection. `_raw`, `_current`, `_previous`, and `collection` are reserved metadata names.
- `update` applies a shallow patch. `rollback` restores and clears the previous snapshot. `set` and successful `load` reset history for replaced records.
- The collection checks key conflicts before changing data and indexes. Direct writes bypass history and indexes. Use collection operations to change tracked data from application methods.

`update(id, path, value)` writes one property using dot notation and explicit array indices. Missing parents are created according to the path. An existing parent with value `undefined` throws. Bracket indices require arrays. Incompatible, inherited, and unsafe paths throw. A write also throws if the updated path is absent from the resulting snapshot. Array indices beyond the current length may leave holes. The update validates indexes before applying the change, then records one rollback step. `update(id, patch)` retains its shallow patch semantics.

## Indexes and search

In `cacheBy`, use a property path for a field index. `{}` creates a grouped index and `{ unique: true }` creates a unique one. For a computed key, supply a name and a selector function or `{ select, unique: true }`. A selector must be pure and depend only on record fields available in the snapshot during updates. Valid keys are strings, numbers, booleans, bigints, and symbols.

`getBy(key, value)` takes a declared path or selector name and a value of the corresponding type. A unique index returns a record or `undefined`. A grouped index returns a live read-only view in collection order. An empty group supports the same interface. Indexes use `Map` equality, so numbers and strings are distinct keys. They skip `null` and `undefined`.

`find`, `findBy`, and `matchBy` work on collections and groups. `findBy` returns the first exact match, and `matchBy` returns every regular-expression match. Indexing and search support nested property paths and explicit array indices. Input arrays and index definitions use `each` with `shallow: true` and `metadata: false`. `getBy` looks up the group in the index. Searches within a group scan only that group's records.

## Relations, loading, and subscriptions

An attached record exposes `belongsTo(criteria)` as a non-enumerable method. Each own enumerable string key in `criteria` is a property path. All paths must resolve through own properties to defined values strictly equal to the supplied values. Empty criteria, empty paths, and selection syntax return `false`. A `belongsTo` already supplied by the record or its behavior takes precedence.

`relations` supplies related collections. Getters synchronously read live record fields through `context.row` and related data through `context.relations`. Use `context.meta` for metadata and `context.collection` for the owning collection. The context's `collection.getBy` returns a general lookup type. Calling `getBy` on the typed collection distinguishes unique indexes from grouped indexes. Use snapshots for persistence and history.

`derive` builds a read-only view from related collection items with distinct `_id` values. Changes to any source mark its indexes for rebuilding on the next read. Call `dispose()` to unsubscribe when the view is no longer needed.

Asynchronous `load` fetches a full set of rows and applies it like `set`. `loading` reflects the latest request. `ready` indicates that initial rows are available or a load has succeeded, even if that load returned an empty array. With no loader, a collection is ready at creation even when empty. With a loader and no initial rows, it becomes ready after the first successful load.

A failed load stores the cause in `error` and leaves the last consistent set of rows available. When loads overlap, only the latest call can apply rows. An older successful request returns the current rows. An older failed request rejects only its own promise. If the collection changes locally during the latest request, the load rejects.

`subscribe` synchronously notifies listeners when the current load starts or ends and when collection changes are applied. It returns an unsubscribe function.

## Acceptance

Verify plain records, class instances, grouped lookup, unique conflicts, rollback, derived collections, and loading state. For a chunk registry, verify manifest projection, composite coordinate keys, stable IDs after a restart, and bulk loading. Build ESM and CJS with type declarations. The skill documents collection use, including calls from workflow actions.
