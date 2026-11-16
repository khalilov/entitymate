import { type Entity } from './classes/Entity'

export type EntityBehavior<Definition> = Definition extends Entity<{}, infer Behavior> ? Behavior : never

export type Key = string | number | boolean | bigint | symbol
export type PathValue<Row, Path> = Path extends keyof Row
  ? Row[Path]
  : Path extends `${infer Head}[${number}]${infer Tail}`
    ? NonNullable<PathValue<Row, Head>> extends readonly (infer Item)[]
      ? Tail extends `.${infer Rest}`
        ? PathValue<Item, Rest>
        : Tail extends ''
          ? Item
          : never
      : never
    : Path extends `${infer Head}.${infer Tail}`
      ? Head extends keyof Row
        ? PathValue<NonNullable<Row[Head]>, Tail>
        : never
      : never

export type Selector<Row> = (row: Readonly<Row>) => Key | null | undefined
export type Ownership<Row> = {
  belongsTo<Path extends string>(criteria: { readonly [Key in Path]: PathValue<Row, Key> }): boolean
}
export type Index<Row> =
  | Selector<Row>
  | {
      readonly select?: Selector<Row>
      readonly unique?: boolean
    }
export type Indexes<Row> = Readonly<Record<string, Index<Row>>>

export type IndexKey<Row, Index, Definition> = Definition extends { readonly select: infer Selector }
  ? IndexKey<Row, Index, Selector>
  : Definition extends (row: Readonly<Row>) => infer Value
    ? Extract<Value, Key>
    : Extract<PathValue<Row, Index>, Key>

export interface ResultCacheOptions {
  readonly cache: string | symbol
  readonly deps?: readonly unknown[]
}

export interface SortByOptions<Item> {
  readonly sortBy?: readonly (readonly [field: keyof Item, direction: 'asc' | 'desc'])[]
}

export interface MapOrderOptions<Item> extends SortByOptions<Item> {
  readonly cache?: never
}

export type CachedMapOptions<Item> = SortByOptions<Item> & ResultCacheOptions

export interface View<Item> extends Iterable<Item> {
  readonly rows: readonly Item[]
  readonly total: number
  each(visit: (item: Item, id: string, index: number) => void, options?: SortByOptions<Item>): void
  map<Result>(project: (item: Item, id: string, index: number) => Result, options?: MapOrderOptions<Item>): Result[]
  map<Result>(
    project: (item: Item, id: string, index: number) => Result,
    options: CachedMapOptions<Item>
  ): readonly Result[]
  sort(compare: (left: Item, right: Item) => number): Item[]
  sort(compare: (left: Item, right: Item) => number, options: ResultCacheOptions): readonly Item[]
  find(predicate: (item: Item) => boolean): Item | undefined
  findBy(path: string, value: unknown): Item | undefined
  matchBy(path: string, pattern: RegExp): Item[]
}

export interface Source {
  subscribe(listener: () => void): () => void
}

export type Relations = Readonly<Record<string, Source>>
export type Identified<Item> = Item & { readonly _id: string }

export interface State<Row> {
  readonly _raw: Readonly<Row>
  readonly _current: Readonly<Row>
  readonly _previous: Readonly<Row> | undefined
}

export interface Options<Row extends object, Definitions, Links, Config, Methods, Args extends unknown[], Meta> {
  readonly cacheBy?: Definitions
  readonly relations?: Links
  readonly config?: Config
  readonly meta?: Meta
  readonly methods?: Methods
  readonly load?: (...args: Args) => Promise<readonly Row[]>
  readonly derive?: (relations: Links) => readonly Identified<Row>[]
}

export interface CollectionContract<Row extends object, Item, Definitions, Links, Config, Args extends unknown[], Meta>
  extends View<Item>, Source {
  readonly relations: Links
  readonly config: Config
  readonly meta: Meta
  readonly loading: boolean
  readonly ready: boolean
  readonly error: unknown
  get(id: string): Item | undefined
  indexOf(id: string): number
  snapshot(ids?: readonly string[]): Partial<Record<string, Readonly<Identified<Row>>>>
  require(id: string): Item
  getBy<IndexKeyName extends keyof Definitions & string>(
    key: IndexKeyName,
    value: IndexKey<Row, IndexKeyName, Definitions[IndexKeyName]>
  ): Definitions[IndexKeyName] extends { readonly unique: true } ? Item | undefined : View<Item>
  add(row: Row): Item
  upsert(row: Row): Item
  update(id: string, patch: Partial<Row>): Item
  update<Path extends string>(id: string, path: Path, value: NoInfer<PathValue<Row, Path>>): Item
  rollback(id: string): Item | undefined
  remove(id: string): Item | undefined
  set(rows: readonly Row[]): readonly Item[]
  reorder(ids: readonly string[]): readonly Item[]
  clear(): void
  dispose(): void
  load(...args: Args): Promise<readonly Item[]>
}
