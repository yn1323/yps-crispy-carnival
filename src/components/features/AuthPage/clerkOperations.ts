export function throwIfClerkOperationFailed(result: { error: unknown | null }): void {
  if (result.error) throw result.error;
}
