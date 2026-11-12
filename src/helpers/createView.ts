import { pick } from 'objwalk'
import { type View } from '../types'

export const createView = <Item extends object>(read: () => readonly Item[]): View<Item> => ({
  get rows() {
    return read()
  },
  get total() {
    return read().length
  },
  [Symbol.iterator]() {
    return read()[Symbol.iterator]()
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
})
