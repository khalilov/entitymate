import { belongsTo } from '../helpers/belongsTo'
import { prepareRowChange } from '../helpers/prepareRowChange'
import { snapshot } from '../helpers/snapshot'
import { type State } from '../types'

type EntityChange<Row> = { readonly next: Row; readonly history: boolean } | { readonly patch: Partial<Row> }
export type PreparedChange<Row> = { readonly current: Row; apply(): void }

export class Entity<Row extends object, Behavior extends object = {}> implements State<Row> {
  readonly descriptors: { [Key in keyof Behavior]: TypedPropertyDescriptor<Behavior[Key]> }
  private readonly _row: Row
  private readonly _rawSnapshot: Row
  private _currentSnapshot: Row
  private _previousSnapshot?: Row

  constructor(row: Row, behavior?: Behavior) {
    const raw = snapshot(row)

    this._row = row
    this._rawSnapshot = raw
    this._currentSnapshot = raw
    this.descriptors = Object.getOwnPropertyDescriptors(behavior ?? {}) as typeof this.descriptors
  }

  get _raw() {
    return snapshot(this._rawSnapshot)
  }

  get _current() {
    return snapshot(this._currentSnapshot)
  }

  get _previous() {
    return this._previousSnapshot === undefined ? undefined : snapshot(this._previousSnapshot)
  }

  prepare(change: EntityChange<Row>): PreparedChange<Row>
  prepare(change: 'rollback'): PreparedChange<Row> | undefined
  prepare(change: EntityChange<Row> | 'rollback'): PreparedChange<Row> | undefined {
    const next =
      change === 'rollback'
        ? this._previousSnapshot
        : 'patch' in change
          ? { ...this._currentSnapshot, ...change.patch }
          : change.next
    const history = change !== 'rollback' && ('patch' in change || change.history)

    if (next !== undefined) {
      const current = snapshot(next)
      const apply = prepareRowChange(this._row, snapshot(current))
      const previous = history ? this._currentSnapshot : undefined

      return {
        current,
        apply: () => {
          apply()
          this._previousSnapshot = previous
          this._currentSnapshot = current
        },
      }
    }

    return undefined
  }

  prepareAttachment(id: string, collection: object, descriptors: PropertyDescriptorMap) {
    const row = this._row
    const metadata: PropertyDescriptorMap = {
      _id: { value: id, enumerable: true },
      _raw: { get: () => this._raw },
      _current: { get: () => this._current },
      _previous: { get: () => this._previous },
      collection: { get: () => collection },
    }

    for (const key of Reflect.ownKeys(descriptors)) {
      if (key in row || Object.hasOwn(metadata, key)) {
        throw new TypeError(`Entity behavior conflicts with property ${String(key)}`)
      }

      Reflect.set(metadata, key, { ...Reflect.get(descriptors, key), enumerable: false })
    }
    for (const key of Reflect.ownKeys(metadata)) {
      const descriptor = Object.getOwnPropertyDescriptor(row, key)

      if (key !== '_id' && key in row) {
        throw new TypeError(`Entity metadata conflicts with property ${String(key)}`)
      }
      if (descriptor?.configurable === false || (descriptor === undefined && Object.isExtensible(row) === false)) {
        throw new TypeError(`Cannot attach entity property ${String(key)}`)
      }
    }

    if ('belongsTo' in row === false && Object.hasOwn(descriptors, 'belongsTo') === false) {
      metadata.belongsTo = { value: (criteria: object) => belongsTo(row, criteria) }
    }

    return () => Object.defineProperties(row, metadata)
  }
}
