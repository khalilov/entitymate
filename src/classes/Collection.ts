import { nanoid } from 'nanoid'
import { each, is, pick, set } from 'objwalk'
import { Entity, type PreparedChange } from './Entity'
import { createView } from '../helpers/createView'
import { isFieldPath } from '../helpers/isFieldPath'
import { snapshot } from '../helpers/snapshot'
import {
  type CachedMapOptions,
  type CollectionContract,
  type Identified,
  type Index,
  type Indexes,
  type IndexKey,
  type View,
  type Key,
  type MapOrderOptions,
  type Options,
  type Ownership,
  type PathValue,
  type Relations,
  type ResultCacheOptions,
  type SortByOptions,
  type Source,
  type State,
} from '../types'

type Item<Row, Behavior> = Identified<Row & Behavior & State<Row>> &
  ('belongsTo' extends keyof Row | keyof Behavior ? {} : Ownership<Identified<Row>>)

type Entry<Row, Behavior> = {
  readonly item: Item<Row, Behavior>
  readonly order: number
  keys: Map<string, Key>
}

type Buckets<Row, Behavior> = Map<string, Map<Key, Entry<Row, Behavior>[]>>

export type CollectionOptions<
  Row extends object,
  Definitions,
  Links,
  Config,
  Methods,
  Args extends unknown[],
  Behavior,
  Meta,
> = Options<Row, Definitions, Links, Config, Methods, Args, Meta> & {
  readonly cacheBy?: Definitions & Indexes<NoInfer<Row>>
  readonly methods?: Methods &
    ThisType<CollectionContract<Row, Item<Row, Behavior>, Definitions, Links, Config, Args, Meta> & Methods>
}

export type BehaviorFactory<
  Row extends object,
  Links,
  Config,
  Args extends unknown[],
  Behavior extends object,
  Meta,
> = (
  context: NoInfer<
    State<Row> &
      Identified<object> & {
        readonly row: Readonly<Row>
        readonly relations: Links
        readonly meta: Meta
        readonly collection: Omit<CollectionContract<Row, Identified<Row>, {}, Links, Config, Args, Meta>, 'getBy'> & {
          getBy(key: string, value: Key): Identified<Row> | View<Identified<Row>> | undefined
        }
      }
  >
) => Entity<{}, Behavior>

export class Collection<
  Row extends object,
  const Definitions extends Indexes<Row> = {},
  const Links extends Relations = {},
  Config = undefined,
  Methods extends object = {},
  Args extends unknown[] = [],
  Behavior extends object = {},
  Meta = undefined,
> implements CollectionContract<Row, Item<Row, Behavior>, Definitions, Links, Config, Args, Meta> {
  readonly relations: Links
  readonly config: Config
  readonly meta: Meta
  private readonly _options: Options<Row, Definitions, Links, Config, Methods, Args, Meta>
  private readonly _behavior?: BehaviorFactory<Row, Links, Config, Args, Behavior, Meta>
  private readonly _definitions: [string, Index<Row>][]
  private readonly _unique = new Set<string>()
  private readonly _attached = new WeakMap<Row, Entity<Row>>()
  private readonly _subscriptions: (() => void)[] = []
  private readonly _listeners = new Set<() => void>()
  private readonly _view = createView(() => this.rows)
  private _entries = new Map<string, Entry<Row, Behavior>>()
  private _buckets: Buckets<Row, Behavior> = new Map()
  private _sequence = 0
  private _version = 0
  private _request = 0
  private _rowView?: readonly Item<Row, Behavior>[]
  private _positions?: Map<string, number>
  private _loading = false
  private _ready: boolean
  private _error: unknown
  private _dirty: boolean

  constructor(
    rows: readonly Row[],
    behavior?: BehaviorFactory<Row, Links, Config, Args, Behavior, Meta>,
    options?: CollectionOptions<Row, Definitions, Links, Config, Methods, Args, Behavior, Meta>
  ) {
    const { cacheBy, relations = {} as Links, config, meta, methods, load, derive } = options ?? {}
    const definitions: Indexes<Row> = cacheBy ?? {}

    this._options = options ?? {}
    this._behavior = behavior
    this.relations = relations
    this.config = config as Config
    this.meta = meta as Meta
    this._ready = load === undefined || rows.length > 0
    this._dirty = derive !== undefined
    this._definitions = []
    each(
      definitions,
      (name, definition) => {
        this._definitions.push([name, definition])
        if (typeof definition === 'object' && definition.unique === true) {
          this._unique.add(name)
        }
      },
      { shallow: true, metadata: false }
    )

    for (const key of Reflect.ownKeys(methods ?? {})) {
      const descriptor = Object.getOwnPropertyDescriptor(methods ?? {}, key)

      if (key in this) {
        throw new TypeError(`Collection method conflicts with property ${String(key)}`)
      }
      if (descriptor !== undefined) {
        Object.defineProperty(this, key, descriptor)
      }
    }

    if (derive === undefined) {
      this._replace(rows)
    } else {
      for (const source of new Set(Object.values<Source>(relations))) {
        this._subscriptions.push(
          source.subscribe(() => {
            this._dirty = true
            this._notify()
          })
        )
      }
    }
  }

  get rows() {
    this._refresh()
    this._rowView ??= Object.freeze([...this._entries.values()].map(({ item }) => item))

    return this._rowView
  }

  get total() {
    return this.rows.length
  }

  get loading() {
    return this._loading
  }

  get ready() {
    return this._ready
  }

  get error() {
    return this._error
  }

  [Symbol.iterator]() {
    return this.rows[Symbol.iterator]()
  }

  each(
    callback: (item: Item<Row, Behavior>, id: string, index: number) => void,
    options?: SortByOptions<Item<Row, Behavior>>
  ): void {
    this._view.each(callback, options)
  }

  map<Result>(
    callback: (item: Item<Row, Behavior>, id: string, index: number) => Result,
    options?: MapOrderOptions<Item<Row, Behavior>>
  ): Result[]
  map<Result>(
    callback: (item: Item<Row, Behavior>, id: string, index: number) => Result,
    options: CachedMapOptions<Item<Row, Behavior>>
  ): readonly Result[]
  map<Result>(
    callback: (item: Item<Row, Behavior>, id: string, index: number) => Result,
    options?: MapOrderOptions<Item<Row, Behavior>> | CachedMapOptions<Item<Row, Behavior>>
  ): readonly Result[] {
    return options?.cache === undefined ? this._view.map(callback, options) : this._view.map(callback, options)
  }

  sort(callback: (left: Item<Row, Behavior>, right: Item<Row, Behavior>) => number): Item<Row, Behavior>[]
  sort(
    callback: (left: Item<Row, Behavior>, right: Item<Row, Behavior>) => number,
    options: ResultCacheOptions
  ): readonly Item<Row, Behavior>[]
  sort(
    callback: (left: Item<Row, Behavior>, right: Item<Row, Behavior>) => number,
    options?: ResultCacheOptions
  ): readonly Item<Row, Behavior>[] {
    return options === undefined ? this._view.sort(callback) : this._view.sort(callback, options)
  }

  find(predicate: (item: Item<Row, Behavior>) => boolean) {
    return this.rows.find(predicate)
  }

  findBy(path: string, value: unknown) {
    return this._view.findBy(path, value)
  }

  matchBy(path: string, pattern: RegExp) {
    return this._view.matchBy(path, pattern)
  }

  subscribe(listener: () => void) {
    this._listeners.add(listener)

    return () => {
      this._listeners.delete(listener)
    }
  }

  get(id: string) {
    this._refresh()

    return this._entries.get(id)?.item
  }

  indexOf(id: string): number {
    this._refresh()
    this._positions ??= new Map([...this._entries.keys()].map((key, index) => [key, index]))

    return this._positions.get(id) ?? -1
  }

  snapshot(ids: readonly string[] = []): Partial<Record<string, Readonly<Identified<Row>>>> {
    this._refresh()

    const keys = ids.length === 0 ? this._entries.keys() : new Set(ids)
    const records: Partial<Record<string, Readonly<Identified<Row>>>> = Object.create(null)

    for (const id of keys) {
      const entry = this._entries.get(id)

      if (entry !== undefined) {
        const { item } = entry

        records[id] = { ...(item._current ?? snapshot<Row>(item)), _id: id }
      }
    }

    return records
  }

  require(id: string) {
    const item = this.get(id)

    if (item !== undefined) {
      return item
    }

    throw new Error(`Missing _id: ${id}`)
  }

  getBy<IndexKeyName extends keyof Definitions & string>(
    key: IndexKeyName,
    value: IndexKey<Row, IndexKeyName, Definitions[IndexKeyName]>
  ): Definitions[IndexKeyName] extends { readonly unique: true }
    ? Item<Row, Behavior> | undefined
    : View<Item<Row, Behavior>>
  getBy(key: string, value: Key) {
    this._refresh()
    if (this._unique.has(key)) {
      return this._buckets.get(key)?.get(value)?.[0]?.item
    }

    let cachedVersion = -1
    let cached: readonly Item<Row, Behavior>[] = []

    return createView(() => {
      this._refresh()
      if (cachedVersion !== this._version) {
        cached = Object.freeze((this._buckets.get(key)?.get(value) ?? []).map(({ item }) => item))
        cachedVersion = this._version
      }

      return cached
    })
  }

  add(row: Row) {
    const id = this._keyOf(row) ?? nanoid()

    this._ensureWritable()
    if (this._entries.has(id) === false) {
      const { entry, apply } = this._prepareEntry(row, id, this._sequence)

      this._checkKeys(this._buckets, entry.keys)
      apply?.()
      this._sequence += 1
      this._entries.set(id, entry)
      this._insertKeys(this._buckets, entry)
      this._changed()

      return entry.item
    }

    throw new Error(`Duplicate _id: ${id}`)
  }

  upsert(row: Row) {
    const id = this._keyOf(row)
    const entry = id === undefined ? undefined : this._entries.get(id)

    this._ensureWritable()

    return entry === undefined
      ? this.add(row)
      : this._applyUpdate(entry, this._entityFor(entry.item).prepare({ next: row, history: true }))
  }

  update(id: string, patch: Partial<Row>): Item<Row, Behavior>
  update<Path extends string>(id: string, path: Path, value: NoInfer<PathValue<Row, Path>>): Item<Row, Behavior>
  update(id: string, patch: Partial<Row> | string, value?: unknown) {
    const entry = this._entries.get(id)

    this._ensureWritable()
    if (entry !== undefined) {
      const entity = this._entityFor(entry.item)

      if (typeof patch === 'string') {
        const next = entity._current
        const [root] = patch.split(/[.\[]/, 1)

        if (['_id', '_raw', '_current', '_previous', 'collection'].includes(root)) {
          throw new TypeError(`Reserved update path: ${patch}`)
        }
        if (isFieldPath(patch) === false) {
          throw new TypeError(`Invalid update path: ${patch}`)
        }

        set(next, patch, value, { strict: true })

        const change = entity.prepare({ next, history: true })
        const { current } = change
        const preserved =
          value === undefined
            ? is(current, patch, 'undefined')
            : pick(current, patch, { inherited: false }) !== undefined

        if (preserved) {
          return this._applyUpdate(entry, change)
        }

        throw new TypeError(`Update path does not survive snapshot: ${patch}`)
      }

      const { _id } = patch as { _id?: unknown }

      if (_id !== undefined && _id !== id) {
        throw new TypeError('Cannot change _id')
      }

      return this._applyUpdate(entry, entity.prepare({ patch }))
    }

    throw new Error(`Missing _id: ${id}`)
  }

  rollback(id: string) {
    const entry = this._entries.get(id)

    this._ensureWritable()
    if (entry !== undefined) {
      const change = this._entityFor(entry.item).prepare('rollback')

      if (change !== undefined) {
        return this._applyUpdate(entry, change)
      }
    }

    return undefined
  }

  remove(id: string) {
    const entry = this._entries.get(id)

    this._ensureWritable()
    if (entry !== undefined) {
      this._removeKeys(entry)
      this._entries.delete(id)
      this._changed()
    }

    return entry?.item
  }

  set(incoming: readonly Row[]) {
    this._ensureWritable()
    this._replace(incoming)
    this._notify()

    return this.rows
  }

  reorder(ids: readonly string[]) {
    const entries = new Map<string, Entry<Row, Behavior>>()
    const buckets: Buckets<Row, Behavior> = new Map()

    this._ensureWritable()
    if (ids.length === this._entries.size) {
      for (const [order, id] of ids.entries()) {
        const entry = this._entries.get(id)

        if (entry !== undefined && entries.has(id) === false) {
          const ordered = { ...entry, order }

          entries.set(id, ordered)
          this._insertKeys(buckets, ordered)
        } else {
          throw new Error('Expected each collection _id exactly once')
        }
      }

      this._entries = entries
      this._buckets = buckets
      this._sequence = entries.size
      this._changed()

      return this.rows
    }

    throw new Error('Expected each collection _id exactly once')
  }

  clear() {
    this.set([])
  }

  dispose() {
    for (const unsubscribe of this._subscriptions.splice(0)) {
      unsubscribe()
    }

    this._listeners.clear()
  }

  async load(...args: Args) {
    const { load } = this._options
    const current = this._version
    const ticket = this._request + 1

    this._ensureWritable()
    if (load !== undefined) {
      this._request = ticket
      this._loading = true
      this._error = undefined
      this._notify()
      try {
        const incoming = await load(...args)

        if (ticket === this._request) {
          if (current === this._version) {
            this._replace(incoming)
            this._ready = true
          } else {
            throw new Error('Collection changed during load')
          }
        }

        return this.rows
      } catch (cause) {
        if (ticket === this._request) {
          this._error = cause
        }

        throw cause
      } finally {
        if (ticket === this._request) {
          this._loading = false
          this._notify()
        }
      }
    }

    throw new Error('Collection has no loader')
  }

  private _notify() {
    for (const listener of [...this._listeners]) {
      try {
        listener()
      } catch (cause) {
        console.error(cause)
      }
    }
  }

  private _keyOf(row: Row) {
    const { _id, id } = row as { _id?: unknown; id?: unknown }

    if (_id === undefined || typeof _id === 'string') {
      return _id ?? (typeof id === 'string' ? id : undefined)
    }

    throw new TypeError('Expected a string _id')
  }

  private _keysOf(row: Row) {
    const keys = new Map<string, Key>()

    for (const [name, definition] of this._definitions) {
      const selector = typeof definition === 'object' ? definition.select : definition
      const key: unknown = selector === undefined ? pick(row, name) : selector(row)

      if (
        typeof key === 'string' ||
        typeof key === 'number' ||
        typeof key === 'boolean' ||
        typeof key === 'symbol' ||
        typeof key === 'bigint'
      ) {
        keys.set(name, key)
      } else if (key !== undefined && key !== null) {
        throw new TypeError(`Invalid index key: ${name}`)
      }
    }

    return keys
  }

  private _checkKeys(target: Buckets<Row, Behavior>, keys: Map<string, Key>, entry?: Entry<Row, Behavior>) {
    for (const [name, key] of keys) {
      const owner = target.get(name)?.get(key)?.[0]

      if (this._unique.has(name) && owner !== undefined && owner !== entry) {
        throw new Error(`Duplicate index key: ${name}`)
      }
    }
  }

  private _insertKeys(target: Buckets<Row, Behavior>, entry: Entry<Row, Behavior>, keys = entry.keys) {
    for (const [name, key] of keys) {
      const index = target.get(name) ?? new Map<Key, Entry<Row, Behavior>[]>()
      const bucket = index.get(key) ?? []

      if (bucket.length === 0 || bucket[bucket.length - 1].order < entry.order) {
        bucket.push(entry)
      } else {
        const position = bucket.findIndex((candidate) => candidate.order > entry.order)

        bucket.splice(position, 0, entry)
      }
      index.set(key, bucket)
      target.set(name, index)
    }
  }

  private _removeKeys(entry: Entry<Row, Behavior>, keys = entry.keys) {
    for (const [name, key] of keys) {
      const index = this._buckets.get(name)
      const bucket = index?.get(key)

      if (index !== undefined && bucket !== undefined) {
        bucket.splice(bucket.indexOf(entry), 1)
        if (bucket.length === 0) {
          index.delete(key)
        }
      }
    }
  }

  private _entityFor(row: Row) {
    const state = this._attached.get(row)

    if (state !== undefined) {
      return state
    }

    throw new Error('Missing entity state')
  }

  private _prepareEntry(row: Row, id: string, order: number) {
    const detached = this._attached.get(row)
    const entry: Entry<Row, Behavior> = { item: row as Item<Row, Behavior>, order, keys: this._keysOf(row) }

    if (detached === undefined) {
      const state = new Entity(row)
      const context = {
        row,
        _id: id,
        get _raw() {
          return state._raw
        },
        get _current() {
          return state._current
        },
        get _previous() {
          return state._previous
        },
        collection: this,
        relations: this.relations,
        meta: this.meta,
      }
      const descriptors = this._behavior?.(context).descriptors ?? {}
      const apply = state.prepareAttachment(id, this, descriptors)

      return {
        entry,
        apply: () => {
          apply()
          this._attached.set(row, state)
        },
      }
    }

    return { entry, apply: undefined }
  }

  private _replace(incoming: readonly Row[]) {
    const next = new Map<string, Entry<Row, Behavior>>()
    const indexes: Buckets<Row, Behavior> = new Map()
    const changes: (() => void)[] = []
    const seen = new Set<Row>()

    each(
      incoming,
      (order, row) => {
        const id = this._keyOf(row) ?? nanoid()
        const existing = this._entries.get(id)

        if (next.has(id) || seen.has(row)) {
          throw new Error(`Duplicate _id: ${id}`)
        }
        seen.add(row)

        if (existing !== undefined) {
          const { current, apply } = this._entityFor(existing.item).prepare({ next: row, history: false })
          const ordered = { ...existing, order, keys: this._keysOf(current) }

          this._checkKeys(indexes, ordered.keys)
          this._insertKeys(indexes, ordered)
          next.set(id, ordered)
          changes.push(apply)
        } else {
          const { entry, apply } = this._prepareEntry(row, id, order)

          this._checkKeys(indexes, entry.keys)
          this._insertKeys(indexes, entry)
          next.set(id, entry)
          if (apply !== undefined) {
            changes.push(apply)
          }
        }
      },
      { shallow: true, metadata: false }
    )
    if (next.size !== incoming.length) {
      throw new TypeError('Collection rows must be a dense array')
    }

    for (const apply of changes) {
      apply()
    }
    this._entries = next
    this._buckets = indexes
    this._sequence = incoming.length
    this._invalidate()
  }

  private _invalidate(orderChanged = true) {
    this._rowView = undefined
    if (orderChanged) {
      this._positions = undefined
    }
    this._version += 1
  }

  private _changed(orderChanged = true) {
    this._invalidate(orderChanged)
    this._notify()
  }

  private _ensureWritable() {
    if (this._options.derive !== undefined) {
      throw new TypeError('Derived collections are read-only')
    }
  }

  private _refresh() {
    const { derive } = this._options

    if (derive !== undefined && this._dirty) {
      const next = new Map<string, Entry<Row, Behavior>>()
      const indexes: Buckets<Row, Behavior> = new Map()
      const rows = derive(this.relations)

      each(
        rows,
        (order, row) => {
          const { _id } = row

          if (next.has(_id)) {
            throw new Error('Derived collections require distinct source _ids')
          }

          const entry = { item: row as Item<Row, Behavior>, order, keys: this._keysOf(row) }

          this._checkKeys(indexes, entry.keys)
          this._insertKeys(indexes, entry)
          next.set(_id, entry)
        },
        { shallow: true, metadata: false }
      )
      if (next.size !== rows.length) {
        throw new TypeError('Derived collection rows must be a dense array')
      }
      this._entries = next
      this._buckets = indexes
      this._invalidate()
      this._dirty = false
    }
  }

  private _applyUpdate(entry: Entry<Row, Behavior>, { current, apply }: PreparedChange<Row>) {
    const keys = this._keysOf(current)
    const removed = new Map([...entry.keys].filter(([name, key]) => Object.is(keys.get(name), key) === false))
    const added = new Map([...keys].filter(([name, key]) => Object.is(entry.keys.get(name), key) === false))

    this._checkKeys(this._buckets, added, entry)
    apply()
    this._removeKeys(entry, removed)
    entry.keys = keys
    this._insertKeys(this._buckets, entry, added)
    this._changed(false)

    return entry.item
  }
}
