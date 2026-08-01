import { ConvexError } from "convex/values";

function hasStringData(error: unknown): error is { data: string } {
  return typeof error === "object" && error !== null && "data" in error && typeof error.data === "string";
}

export function getConvexErrorMessage(error: unknown): string | undefined {
  if (hasStringData(error)) return error.data;
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  if (error instanceof Error) return error.message;
  return undefined;
}
