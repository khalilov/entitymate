import { describe, expect, it } from 'vitest'
import { collection, entity } from '../src'
import { Collection } from '../src/classes/Collection'
import { Entity } from '../src/classes/Entity'

describe('collection', () => {
  it('updates a nested path atomically and rolls back created containers', () => {
    type Row = { id: string; meta: { label: string; samples?: { value: number }[]; owner?: string } }

    const rows: Row[] = [
      { id: 'a', meta: { label: 'A' } },
      { id: 'b', meta: { label: 'B', owner: 'taken' } },
    ]
    const records = collection(rows, undefined, { cacheBy: { 'meta.owner': { unique: true } } })
    const item = records.require('a')

    records.update('a', 'meta.samples[0].value', 1)
    expect(item.meta).toEqual({ label: 'A', samples: [{ value: 1 }] })
    expect(() => records.update('a', 'meta.owner', 'taken')).toThrow('Duplicate index key')
    expect(item._previous?.meta).toEqual({ label: 'A' })
    expect(() => Reflect.apply(records.update, records, ['a', 'meta.label.value', 1])).toThrow('Incompatible')
    expect(() => Reflect.apply(records.update, records, ['a', 'meta.__proto__.value', 1])).toThrow('Unsafe')
    expect(() => Reflect.apply(records.update, records, ['a', '_id', 'other'])).toThrow('Reserved')
    expect(() => Reflect.apply(records.update, records, ['a', 'meta..value', 1])).toThrow('Invalid')
    records.rollback('a')
    expect(item.meta).toEqual({ label: 'A' })
    records.update('a', { meta: { label: 'new', owner: 'free' } })
    expect(records.getBy('meta.owner', 'free')).toBe(item)
    records.rollback('a')
    expect(item.meta).toEqual({ label: 'A' })
  })

  it('rejects path updates discarded by snapshots without changing history', () => {
    const records = collection([{ id: 'a', stamp: new Date(0), label: 'before' }])
    const item = records.update('a', { label: 'after' })

    expect(() => Reflect.apply(records.update, records, ['a', 'stamp.extra', 'lost'])).toThrow('does not survive')
    expect(() => Reflect.apply(records.update, records, ['a', 'stamp.extra', undefined])).toThrow('does not survive')
    expect(item._previous?.label).toBe('before')
    expect(item.stamp).not.toHaveProperty('extra')
    Reflect.apply(records.update, records, ['a', 'optional', undefined])
    expect(Object.hasOwn(item, 'optional')).toBe(true)
  })

  it('snapshots selected keys and reports positions after membership and order changes', () => {
    const records = collection([{ details: { count: 1 } }])
    const [first] = records.rows
    const second = records.add({ details: { count: 2 } })
    const selected = records.snapshot([first._id, 'missing', first._id])

    expect(selected).toEqual({ [first._id]: { _id: first._id, details: { count: 1 } } })
    expect(records.snapshot([])).toEqual(records.snapshot())
    expect(records.snapshot(['constructor']).constructor).toBeUndefined()
    expect(records.indexOf(second._id)).toBe(1)
    records.update(first._id, 'details.count', 3)
    expect(selected[first._id]?.details.count).toBe(1)
    records.reorder([second._id, first._id])
    expect(records.indexOf(first._id)).toBe(1)
    records.remove(second._id)
    expect(records.indexOf(first._id)).toBe(0)
    expect(records.indexOf(second._id)).toBe(-1)
  })

  it('matches all own paths against live data and preserves custom predicates', () => {
    const records = collection([{ id: 'a', owner: null, cargo: [{ count: 0 }], pending: false }])
    const item = records.require('a')
    const custom = collection([{ id: 'b' }], () => entity({ belongsTo: (owner: string) => owner === 'custom' }))

    expect(item.belongsTo({ _id: 'a', owner: null, 'cargo[0].count': 0, pending: false })).toBe(true)
    expect(item.belongsTo({ id: 'wrong', owner: null })).toBe(false)
    expect(item.belongsTo({})).toBe(false)
    expect(Reflect.apply(item.belongsTo, item, [{ '': item }])).toBe(false)
    expect(Reflect.apply(item.belongsTo, item, [{ '{id}': 'a' }])).toBe(false)
    expect(Reflect.apply(item.belongsTo, item, [{ 'cargo[1].count': undefined }])).toBe(false)
    expect(Reflect.apply(item.belongsTo, item, [{ 'cargo.toString': Array.prototype.toString }])).toBe(false)
    expect(Object.keys(item)).not.toContain('belongsTo')
    records.update('a', { pending: true })
    expect(item.belongsTo({ pending: true })).toBe(true)
    expect(custom.require('b').belongsTo('custom')).toBe(true)
  })

  it('reorders live groups without replacing rows or changing history', () => {
    const records = collection(
      [
        { id: 'a', group: 'tools', count: 1 },
        { id: 'b', group: 'tools', count: 2 },
      ],
      undefined,
      { cacheBy: { group: {} } }
    )
    const a = records.update('a', { count: 3 })
    const b = records.require('b')
    const tools = records.getBy('group', 'tools')
    const orders: string[][] = []

    records.subscribe(() => orders.push(tools.rows.map(({ _id }) => _id)))
    expect(() => records.reorder(['a'])).toThrow()
    expect(() => records.reorder(['b', 'missing'])).toThrow()
    expect(() => records.reorder(['b', 'b'])).toThrow()
    expect(records.rows).toEqual([a, b])
    expect(orders).toEqual([])

    expect(records.reorder(['b', 'a'])).toEqual([b, a])
    expect(records.require('a')).toBe(a)
    expect(orders).toEqual([['b', 'a']])
    expect(a._current.count).toBe(3)
    expect(a._previous?.count).toBe(1)
    expect(records.rollback('a')).toBe(a)
    expect(a.count).toBe(1)
    records.add({ id: 'c', group: 'tools', count: 4 })
    expect(tools.rows.map(({ _id }) => _id)).toEqual(['b', 'a', 'c'])
  })

  it('keeps ordered groups live through update, rollback, and reload', () => {
    const rows = [
      { id: 'a', sku: '1', details: { category: 'tools', brand: 'Makita' } },
      { id: 'b', sku: '2', details: { category: 'tools', brand: 'Bosch' } },
    ]
    const products = collection(rows, undefined, {
      cacheBy: {
        sku: { unique: true },
        'details.category': {},
        categorySku: { unique: true, select: ({ details, sku }) => `${details.category}:${sku}` },
      },
    })
    const tools = products.getBy('details.category', 'tools')
    const garden = products.getBy('details.category', 'garden')
    const drill = products.require('a')

    expect(drill).toBe(rows[0])
    expect(tools.findBy('details.brand', 'Makita')).toBe(drill)
    expect(tools.matchBy('details.brand', /mak/i)).toEqual([drill])
    products.update('a', { details: { category: 'garden', brand: 'Makita' } })
    expect(tools.rows.map(({ _id }) => _id)).toEqual(['b'])
    expect(garden.rows).toEqual([drill])
    expect(products.getBy('categorySku', 'garden:1')).toBe(drill)
    expect(products.getBy('categorySku', 'tools:1')).toBeUndefined()
    expect(drill._raw.details.category).toBe('tools')
    expect(drill._previous?.details.category).toBe('tools')
    expect(products.rollback('a')).toBe(drill)
    expect(tools.rows.map(({ _id }) => _id)).toEqual(['a', 'b'])
    expect(garden.total).toBe(0)
    products.set([{ id: 'a', sku: '1', details: { category: 'garden', brand: 'Makita' } }])
    expect(products.require('a')).toBe(drill)
    expect(drill._current.details.category).toBe('garden')
    products.update('a', { sku: '3' })
    expect(drill._previous?.sku).toBe('1')
    expect(products.getBy('sku', '3')).toBe(drill)
  })

  it('rejects conflicts before changing any rows, indexes, or history', () => {
    const records = collection(
      [
        { id: 'a', code: 'x' },
        { id: 'b', code: 'y' },
      ],
      undefined,
      {
        cacheBy: { code: { unique: true } },
      }
    )
    const a = records.require('a')
    const b = records.require('b')

    expect(() => records.update('a', { code: 'y' })).toThrow()
    expect(() =>
      records.set([
        { id: 'a', code: 'z' },
        { id: 'b', code: 'z' },
      ])
    ).toThrow()
    expect(a.code).toBe('x')
    expect(a._previous).toBeUndefined()
    expect(records.getBy('code', 'x')).toBe(a)
    expect(records.getBy('code', 'y')).toBe(b)
    records.update('a', { code: 'z' })
    records.update('b', { code: 'x' })
    expect(() => records.rollback('a')).toThrow()
    expect(records.getBy('code', 'z')).toBe(a)
    expect(a._previous?.code).toBe('x')
  })

  it('rejects duplicate IDs, repeated references, and sparse replacements before applying changes', () => {
    const row: { id?: string; code: string } = { id: 'a', code: 'original' }
    const pending = { code: 'new' }
    const records = collection([row])
    const sparse = Array<typeof row>(2)

    sparse[0] = { id: 'a', code: 'modified' }
    expect(() =>
      records.set([
        { id: 'a', code: 'modified' },
        { id: 'a', code: 'duplicate' },
      ])
    ).toThrow('Duplicate _id')
    expect(() => records.set([pending, pending])).toThrow('Duplicate _id')
    expect(() => records.set(sparse)).toThrow('dense array')
    expect(pending).not.toHaveProperty('_id')
    expect(records.require('a')).toBe(row)
    expect(row.code).toBe('original')
  })

  it('preserves class identity, behavior, and related reads', () => {
    class Product {
      #offset = 1

      constructor(public count: number) {}

      get total() {
        return this.count + this.#offset
      }
    }

    const related = collection([{ id: 'category', name: 'Tools' }])
    const input = new Product(1)
    const meta = { label: 'Category' }
    const records = collection(
      [input],
      ({ relations, meta }) =>
        entity({
          get category() {
            return `${meta.label}: ${relations.related.get('category')?.name}`
          },
        }),
      { relations: { related }, meta }
    )
    const [product] = records.rows

    expect(product).toBe(input)
    expect(product).toBeInstanceOf(Product)
    expect(product._id).toMatch(/^[\w-]{21}$/)
    expect(records.meta).toBe(meta)
    expect(product.category).toBe('Category: Tools')
    related.update('category', { name: 'Garden' })
    records.update(product._id, { count: 4 })
    expect(product.total).toBe(5)
    expect(product.category).toBe('Category: Garden')
    records.remove(product._id)
    expect(records.add(input)).toBe(product)
  })

  it('treats an empty load as ready and keeps committed rows on failure', async () => {
    const records = collection<{ id: string }>([], undefined, {
      load: async () => [],
    })
    const states: boolean[] = []

    records.subscribe(() => {
      states.push(records.loading)
    })
    expect(records.ready).toBe(false)
    await expect(records.load()).resolves.toEqual([])
    expect(records.ready).toBe(true)
    expect(states).toEqual([true, false])

    const failing = collection([{ id: 'a' }], undefined, {
      load: async () => {
        throw new Error('offline')
      },
    })

    await expect(failing.load()).rejects.toThrow('offline')
    expect(failing.ready).toBe(true)
    expect(failing.loading).toBe(false)
    expect(failing.error).toBeInstanceOf(Error)
    expect(failing.get('a')).toBeDefined()
  })

  it('refreshes a derived index after either source changes', () => {
    const signed = collection([{ id: 'signed', state: 'done' }])
    const drafts = collection([{ id: 'draft', state: 'open' }])
    const docs = collection([], undefined, {
      relations: { signed, drafts },
      derive: ({ signed, drafts }) => [...signed, ...drafts],
      cacheBy: { state: {} },
    })
    const open = docs.getBy('state', 'open')

    expect(open.rows).toEqual(drafts.rows)
    signed.update('signed', { state: 'open' })
    expect(open.rows.map(({ _id }) => _id)).toEqual(['signed', 'draft'])
    drafts.clear()
    expect(open.rows.map(({ _id }) => _id)).toEqual(['signed'])
  })
})

it('keeps the latest load and rejects a snapshot that races with a local edit', async () => {
  type Row = { id: string; value: number }

  const loads = new Map<number, (rows: Row[]) => void>()
  const records = collection([{ id: 'a', value: 0 }], undefined, {
    load: (ticket: number) =>
      new Promise<Row[]>((resolve) => {
        loads.set(ticket, resolve)
      }),
  })
  const first = records.load(1)
  const second = records.load(2)

  loads.get(2)?.([{ id: 'a', value: 2 }])
  await second
  loads.get(1)?.([{ id: 'a', value: 1 }])
  await first
  expect(records.require('a').value).toBe(2)

  const third = records.load(3)

  records.update('a', { value: 4 })
  loads.get(3)?.([{ id: 'a', value: 3 }])
  await expect(third).rejects.toThrow('Collection changed during load')
  expect(records.require('a').value).toBe(4)
})

it('supports direct construction, subclassing, and factory shortcuts', () => {
  class Products extends Collection<{ id: string; price: number }> {
    get subtotal() {
      return this.rows.reduce((total, { price }) => total + price, 0)
    }
  }

  const input = { id: 'a', price: 1 }
  const products = new Products([input])
  const definition = entity({
    get label() {
      return 'product'
    },
  })
  const enhanced = collection([{ id: 'b' }], () => definition)

  expect(enhanced).toBeInstanceOf(Collection)
  expect(definition).toBeInstanceOf(Entity)
  expect(enhanced.require('b').label).toBe('product')
  expect(products.update('a', { price: 2 })).toBe(input)
  expect(products.subtotal).toBe(2)
  expect(products.rollback('a')).toBe(input)
  expect(products.subtotal).toBe(1)
})
