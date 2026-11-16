import { pick } from 'objwalk'
import { type ResultCacheOptions, type SortByOptions, type View } from '../types'
import { readCachedResult } from './readCachedResult'
import { sortRowsBy } from './sortRowsBy'

export const createView = <Item extends { readonly _id: string }>(read: () => readonly Item[]): View<Item> => {
  const view: View<Item> = {
    get rows() {
      return read()
    },
    get total() {
      return read().length
    },
    [Symbol.iterator]() {
      return read()[Symbol.iterator]()
    },
    each: (visit, { sortBy } = {}) => {
      const rows = read()
      const ordered = sortBy === undefined ? rows : sortRowsBy(rows, sortBy)
      const { length } = ordered

      for (let index = 0; index < length; index += 1) {
        const item = ordered[index]
        const { _id } = item

        visit(item, _id, index)
      }
    },
    map: (project, { sortBy, cache, deps }: SortByOptions<Item> & Partial<ResultCacheOptions> = {}) => {
      const rows = read()
      const visit = (item: Item, index: number) => project(item, item._id, index)

      if (cache !== undefined) {
        return readCachedResult(view, rows, 'map', () => sortRowsBy(rows, sortBy).map(visit), { cache, deps, sortBy })
      }

      return (sortBy === undefined ? rows : sortRowsBy(rows, sortBy)).map(visit)
    },
    sort: (compare, options?: ResultCacheOptions) => {
      const rows = read()

      if (options !== undefined) {
        return readCachedResult(view, rows, 'sort', () => [...rows].sort(compare), options)
      }

      return [...rows].sort(compare)
    },
    find: (predicate) => read().find(predicate),
    findBy: (path, value) => read().find((item) => Object.is(pick(item, path), value)),
    matchBy: (path, pattern) => {
      const matcher = new RegExp(pattern)

      return read().filter((item) => {
        const value = pick(item, path)

        matcher.lastIndex = 0

        return typeof value === 'string' && matcher.test(value)
      })
    },
  }

  return view
}
