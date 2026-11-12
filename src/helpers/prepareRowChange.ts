import { rowDescriptors } from './rowDescriptors'

export const prepareRowChange = (row: object, next: object) => {
  const current = rowDescriptors(row)
  const incoming = rowDescriptors(next)
  const definitions = Object.create(null) as PropertyDescriptorMap
  const removed: PropertyKey[] = []

  for (const [key, { configurable }] of current) {
    if (incoming.has(key) === false) {
      if (configurable === true) {
        removed.push(key)
      } else {
        throw new TypeError(`Cannot remove row property ${String(key)}`)
      }
    }
  }

  for (const [key, { value }] of incoming) {
    const existing = Object.getOwnPropertyDescriptor(row, key)

    if (existing === undefined && Object.isExtensible(row)) {
      Reflect.set(definitions, key, { value, enumerable: true, configurable: true, writable: true })
    } else if (existing?.enumerable === true && existing.writable === true) {
      Reflect.set(definitions, key, { value })
    } else if (existing === undefined || existing.enumerable === false || Object.is(existing.value, value) === false) {
      throw new TypeError(`Cannot update row property ${String(key)}`)
    }
  }

  return () => {
    Object.defineProperties(row, definitions)
    for (const key of removed) {
      Reflect.deleteProperty(row, key)
    }
  }
}
