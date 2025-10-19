
/**
 * Fast shallow comparison for arrays to avoid unnecessary re-renders.
 * Returns true if both arrays have the same elements in the same order (by reference).
 */
export const arraysShallowEqual = <T,>(a: T[], b: T[]) => {
  if (a === b) {
    return true;
  }

  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
};
