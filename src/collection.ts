import { Collection, type BehaviorFactory, type CollectionOptions } from './classes/Collection'
import { type Indexes, type Relations } from './types'

export const collection = <
  Row extends object,
  const Definitions extends Indexes<Row> = {},
  const Links extends Relations = {},
  Config = undefined,
  Methods extends object = {},
  Args extends unknown[] = [],
  Behavior extends object = {},
  Meta = undefined,
>(
  rows: readonly Row[],
  behavior?: BehaviorFactory<Row, Links, Config, Args, Behavior, Meta>,
  options?: CollectionOptions<Row, Definitions, Links, Config, Methods, Args, Behavior, Meta>
): Collection<Row, Definitions, Links, Config, Methods, Args, Behavior, Meta> & Methods =>
  new Collection(rows, behavior, options) as Collection<
    Row,
    Definitions,
    Links,
    Config,
    Methods,
    Args,
    Behavior,
    Meta
  > &
    Methods
