import { pick } from 'objwalk'
import { isFieldPath } from './isFieldPath'

export const belongsTo = (row: object, criteria: object): boolean => {
  const keys = Object.keys(criteria)

  return (
    keys.length > 0 &&
    keys.every((path) => {
      if (isFieldPath(path)) {
        const actual: unknown = pick(row, path, { inherited: false })

        return actual !== undefined && actual === Reflect.get(criteria, path)
      }

      return false
    })
  )
}
