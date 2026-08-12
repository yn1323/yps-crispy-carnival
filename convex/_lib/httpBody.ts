export type BoundedJsonBodyError = "unsupported_media_type" | "body_too_large" | "invalid_body";

export type BoundedJsonBodyResult = { ok: true; rawBody: string } | { ok: false; error: BoundedJsonBodyError };

/**
 * JSON Webhook の署名対象を加工せず、実際に受信したbyte数を上限内で読む。
 */
export async function readBoundedJsonBody(request: Request, maxBytes: number): Promise<BoundedJsonBodyResult> {
  if (!hasJsonContentType(request.headers.get("content-type"))) {
    return { ok: false, error: "unsupported_media_type" };
  }
  if (declaredBodyExceedsLimit(request.headers.get("content-length"), maxBytes)) {
    return { ok: false, error: "body_too_large" };
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const reader = request.body?.getReader();

  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        byteLength += value.byteLength;
        if (byteLength > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            // 上限超過の判定をstreamのcancel失敗で上書きしない。
          }
          return { ok: false, error: "body_too_large" };
        }
        chunks.push(value);
      }
    } catch {
      return { ok: false, error: "invalid_body" };
    } finally {
      reader.releaseLock();
    }
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, rawBody: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) };
  } catch {
    return { ok: false, error: "invalid_body" };
  }
}

export function boundedJsonBodyErrorResponse(error: BoundedJsonBodyError): Response {
  if (error === "unsupported_media_type") return new Response("Unsupported media type", { status: 415 });
  if (error === "body_too_large") return new Response("Request body too large", { status: 413 });
  return new Response("Invalid request body", { status: 400 });
}

function hasJsonContentType(contentType: string | null): boolean {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function declaredBodyExceedsLimit(contentLength: string | null, maxBytes: number): boolean {
  if (!contentLength || !/^\d+$/.test(contentLength)) return false;
  return BigInt(contentLength) > BigInt(maxBytes);
}
