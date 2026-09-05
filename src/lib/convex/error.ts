import { ConvexError } from "convex/values";

function getErrorData(error: unknown): unknown {
  return typeof error === "object" && error !== null && "data" in error ? error.data : undefined;
}

export function getConvexErrorCode(error: unknown): string | undefined {
  const data = getErrorData(error);
  if (typeof data === "string") return data;
  if (typeof data === "object" && data !== null && "code" in data && typeof data.code === "string") {
    return data.code;
  }
  return undefined;
}

export function getConvexErrorMessage(error: unknown): string | undefined {
  const data = getErrorData(error);
  if (typeof data === "string") return data;
  if (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string" &&
    data.message.length > 0
  ) {
    return data.message;
  }
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  if (error instanceof Error) return error.message;
  return undefined;
}
