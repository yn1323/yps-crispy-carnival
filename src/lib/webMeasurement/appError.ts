import { ConvexError } from "convex/values";
import type { AppErrorSource, AppErrorSurface } from "@/src/domains/webMeasurement";
import { getConvexErrorCode } from "@/src/lib/convex/error";

const CHUNK_LOAD_ERROR_PATTERN =
  /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading (?:css )?chunk|unable to preload css/i;
const CONVEX_SERVER_ERROR_PATTERN = /\[CONVEX [A-Z]+\(|\bServer Error\b/;
const NETWORK_ERROR_PATTERN = /network|failed to fetch|load failed|timeout|connection lost/i;

type AppErrorClassification = {
  source: AppErrorSource;
  errorCode?: string;
};

function hasConvexErrorData(error: unknown): boolean {
  return error instanceof ConvexError || (typeof error === "object" && error !== null && "data" in error);
}

function getErrorText(error: unknown): { message: string; name: string } {
  if (error instanceof Error) return { message: error.message, name: error.name };
  return { message: typeof error === "string" ? error : "", name: "" };
}

/**
 * 画面に出たエラーの出どころを分類する。
 * messageは分類だけに使い、GAへは送らない。
 */
export function classifyAppError(error: unknown, surface: AppErrorSurface): AppErrorClassification {
  if (hasConvexErrorData(error)) return { source: "server_business", errorCode: getConvexErrorCode(error) };

  const { message, name } = getErrorText(error);
  if (name === "ChunkLoadError" || CHUNK_LOAD_ERROR_PATTERN.test(message)) return { source: "chunk_load" };
  if (CONVEX_SERVER_ERROR_PATTERN.test(message)) {
    return message.includes("ArgumentValidationError")
      ? { source: "server_unexpected", errorCode: "argument_validation_error" }
      : { source: "server_unexpected" };
  }
  if (NETWORK_ERROR_PATTERN.test(message)) return { source: "network" };
  return { source: surface === "toast" ? "client" : "render" };
}
