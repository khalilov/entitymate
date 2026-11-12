# Entitymate

Entitymate keeps an ordered collection of JavaScript objects in memory. Look up records by stable ID, index nested fields, and update a record in place so existing references keep working. It accepts plain objects and class instances, with TypeScript declarations and ESM and CommonJS builds.

> 🤖 Coding agent? Load the [Entitymate skill](skills/entitymate/SKILL.md). For exact behavior and edge cases, see the [specification](SPEC.md).

## Install

```sh
npm install entitymate
```

## Quick start

```ts
import { collection } from 'entitymate'

const drill = { id: 'drill', sku: 'ABC-123', details: { categoryId: 'tools', brand: 'Makita' } }
const products = collection([drill], undefined, {
  cacheBy: {
    sku: { unique: true },
    'details.categoryId': {},
  },
})

const product = products.require('drill') // The original drill object
const tools = products.getBy('details.categoryId', 'tools')

products.getBy('sku', 'ABC-123') // The drill, or undefined if the SKU is absent
tools.findBy('details.brand', 'Makita') // The first match within the tools group

products.update(product._id, { details: { ...product.details, categoryId: 'garden' } })
tools.total // 0
products.rollback(product._id)
tools.total // 1
```

The collection uses a supplied string `_id`, falls back to a string `id`, then generates an ID with Nano ID. It sets `_id` on the original object. Save it alongside `_current` if you need the same key after a restart.

## Index and search

| Operation                                 | Result                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `get(id)` / `require(id)`                 | One record by `_id`. `get` returns `undefined` on a miss, while `require` throws. |
| `getBy(key, value)` on a unique index     | One record or `undefined`.                                                        |
| `getBy(key, value)` on a grouped index    | A live, read-only view in collection order, including an empty view on a miss.    |
| `find(predicate)` / `findBy(path, value)` | The first match in a collection or group.                                         |
| `matchBy(path, regexp)`                   | All records whose string field matches the expression.                            |

Use an Objwalk path such as `details.categoryId` or `items[0].sku` to index a nested field. Use a named selector when the key comes from several fields. Pass the function directly for a grouped index or use `{ select, unique: true }` for a unique one. Unique indexes reject conflicts, while grouped indexes keep every matching record.

## Change records and undo

`add` appends a new record. `upsert` updates the record with the same `_id` in place or appends it. `set` replaces the membership and order while retaining matching instances. `remove` removes one record and `clear` empties the collection.

`update` applies a shallow patch and updates the indexes. `rollback` undoes one successful update or upsert. Both keep the instance alive. The record exposes three snapshots:

- `_raw` holds the data captured when the record first joined the collection.
- `_current` holds the current data.
- `_previous` holds the data before the last undoable change, if there is one.

For persistence, project the data as `{ ...product._current, _id: product._id }`. Use collection operations to edit tracked fields so snapshots and indexes agree.

## Add behavior and relations

Use `collection(rows, behavior, options)` to add entity behavior. Pass `undefined` for behavior when you only need options. `relations` supplies related collections, and `meta` supplies application metadata such as UI labels. Both are available directly in the entity context and on the collection.

```ts
import { collection, entity } from 'entitymate'

const categories = collection([{ id: 'tools', name: 'Tools' }])
const products = collection(
  [{ id: 'drill', categoryId: 'tools' }],
  ({ row, relations, meta }) =>
    entity({
      get categoryLabel() {
        const name = relations.categories.get(row.categoryId)?.name

        return name === undefined ? undefined : `${meta.categoryPrefix}: ${name}`
      },
    }),
  { relations: { categories }, meta: { categoryPrefix: 'Category' } }
)

products.require('drill').categoryLabel // 'Category: Tools'
```

Use the exported `Collection` class when a domain collection needs its own methods and getters through inheritance. `collection(...)` constructs a `Collection`. The exported `Entity` class owns record snapshots and stages changes. `entity(behavior)` builds the behavior definition used by the collection callback.

## Load and derive collections

Pass an async `load` option when rows come from a server. Await `store.load(...args)` at the call site. Lookups stay synchronous and read the last committed rows while loading. Use `loading`, `ready`, and `error` for load state, and `subscribe(listener)` to observe changes. The subscription returns an unsubscribe function.

Use `derive: (relations) => rows` to combine or filter existing collections. A derived collection is read-only, keeps the source instances, and refreshes its indexes after a source changes. Call `dispose()` when the derived collection is no longer needed.

## Development

```sh
bun install
npm run check
npm run pack:check
```
