import { type SortByOptions } from '../types'

export const sortRowsBy = <Item>(rows: readonly Item[], sortBy: SortByOptions<Item>['sortBy']): readonly Item[] => {
  if (sortBy !== undefined && sortBy.length > 0) {
    return [...rows].sort((left, right) => {
      for (const [field, direction] of sortBy) {
        const { [field]: leftValue } = left
        const { [field]: rightValue } = right
        const first = leftValue instanceof Date ? leftValue.getTime() : leftValue
        const second = rightValue instanceof Date ? rightValue.getTime() : rightValue
        const firstPresent =
          typeof first === 'string' ||
          typeof first === 'bigint' ||
          (typeof first === 'number' && Number.isNaN(first) === false)
        const secondPresent =
          typeof second === 'string' ||
          typeof second === 'bigint' ||
          (typeof second === 'number' && Number.isNaN(second) === false)
        const firstText = typeof first === 'string'
        const secondText = typeof second === 'string'

        if (firstPresent !== secondPresent) {
          return firstPresent ? -1 : 1
        }
        if (firstPresent && secondPresent) {
          const order = firstText === secondText ? (first < second ? -1 : Number(first > second)) : firstText ? 1 : -1

          if (order !== 0) {
            return direction === 'asc' ? order : -order
          }
        }
      }

      return 0
    })
  }

  return rows
}
