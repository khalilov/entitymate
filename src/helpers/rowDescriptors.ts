const reserved = new Set<PropertyKey>(['_id', '_raw', '_current', '_previous', 'collection'])

export const rowDescriptors = (row: object) => {
  const descriptors = new Map<PropertyKey, PropertyDescriptor>()

  for (const key of Reflect.ownKeys(row)) {
    const descriptor = Object.getOwnPropertyDescriptor(row, key)

    if (descriptor?.enumerable === true && reserved.has(key) === false) {
      if ('value' in descriptor) {
        descriptors.set(key, descriptor)
      } else {
        throw new TypeError('Entitymate rows require enumerable data properties')
      }
    }
  }

  return descriptors
}
