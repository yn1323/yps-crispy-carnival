import { describe, expect, it } from "vitest";
import { type BoundedJsonBodyError, boundedJsonBodyErrorResponse } from "./httpBody";

describe("boundedJsonBodyErrorResponse", () => {
  it.each([
    ["unsupported_media_type", 415, "Unsupported media type"],
    ["body_too_large", 413, "Request body too large"],
    ["invalid_body", 400, "Invalid request body"],
  ] as const)("%sを既存のHTTP契約へ変換する", async (error, status, body) => {
    const response = boundedJsonBodyErrorResponse(error satisfies BoundedJsonBodyError);

    expect(response.status).toBe(status);
    await expect(response.text()).resolves.toBe(body);
  });
});
