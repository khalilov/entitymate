import { Entity } from './classes/Entity'

export const entity = <Behavior extends object>(behavior: Behavior): Entity<{}, Behavior> => new Entity({}, behavior)
