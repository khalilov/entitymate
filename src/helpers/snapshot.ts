import { rowDescriptors } from './rowDescriptors'

export const snapshot = <Row extends object>(row: Row): Row =>
  structuredClone(Object.fromEntries([...rowDescriptors(row)].map(([key, { value }]) => [key, value]))) as Row
