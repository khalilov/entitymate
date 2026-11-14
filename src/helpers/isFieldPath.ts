export const isFieldPath = (path: string): boolean =>
  /^(?:[^.[\]{}]+|\w+\[(?:0|[1-9]\d*)\])(?:\.(?:[^.[\]{}]+|\w+\[(?:0|[1-9]\d*)\]))*$/.test(path)
