import { type ResultCacheOptions, type SortByOptions } from '../types'

type CacheOptions = ResultCacheOptions & SortByOptions<Record<PropertyKey, unknown>>
type Criteria = NonNullable<CacheOptions['sortBy']>

type CacheEntry = {
  sortBy: Criteria
  deps: readonly unknown[]
  result: unknown[]
}

type Operation = 'map' | 'sort'
type Results = Partial<Record<Operation, CacheEntry>>
type ViewCache = {
  rows: readonly unknown[]
  entries: Map<ResultCacheOptions['cache'], Results>
}

const empty: readonly [] = []
const caches = new WeakMap<object, ViewCache>()

export const readCachedResult = <Result>(
  view: object,
  rows: readonly unknown[],
  operation: Operation,
  compute: () => Result[],
  { cache, deps = empty, sortBy = empty }: CacheOptions
): Result[] => {
  const previous = caches.get(view)
  const current =
    previous?.rows === rows ? previous : { rows, entries: new Map<ResultCacheOptions['cache'], Results>() }
  const results = current.entries.get(cache) ?? {}
  const { [operation]: entry } = results

  if (
    entry !== undefined &&
    entry.sortBy.length === sortBy.length &&
    entry.sortBy.every(([field, direction], index) => field === sortBy[index][0] && direction === sortBy[index][1]) &&
    entry.deps.length === deps.length &&
    entry.deps.every((dep, index) => Object.is(dep, deps[index]))
  ) {
    // Each cache key identifies a single computation and result type.
    return entry.result as Result[]
  } else {
    const criteria = sortBy.map(([field, direction]) => [field, direction] as const)
    const dependencies = Array.from(deps)
    const result = compute()
    const active = caches.get(view)
    const target = active?.rows === rows ? active : active === previous ? current : undefined

    Object.freeze(result)
    if (target !== undefined) {
      const targetResults = target.entries.get(cache) ?? results

      targetResults[operation] = { sortBy: criteria, deps: dependencies, result }
      target.entries.set(cache, targetResults)
      caches.set(view, target)
    }

    return result
  }
}
