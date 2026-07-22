export const isReverificationCancelledError = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "reverification_cancelled";
