import { createHash } from "node:crypto";
import { type ReportStore, ReportStoreConflictError, type StorePutOptions } from "./hostedReportStore.mjs";

interface StoredObject {
  body: Buffer;
  etag: string;
  metadata: Record<string, string>;
  lastModified: Date;
}

interface MemoryState {
  objects: Map<string, StoredObject>;
  beforePut: null | ((key: string) => Promise<void>);
  beforeDelete: null | ((keys: string[]) => Promise<void>);
  now: Date;
  seed(
    key: string,
    value: string | Uint8Array,
    lastModified?: Date,
    metadata?: Record<string, string>,
  ): { etag: string };
}

export function createMemoryReportStore(now = new Date("2026-09-05T00:00:00Z")) {
  const objects = new Map<string, StoredObject>();
  let revision = 0;
  const state: MemoryState = {
    objects,
    beforePut: null,
    beforeDelete: null,
    now,
    seed(key: string, value: string | Uint8Array, lastModified = state.now, metadata: Record<string, string> = {}) {
      const body = Buffer.from(value);
      const etag = `"${createHash("md5").update(body).digest("hex")}-${++revision}"`;
      objects.set(key, { body, etag, lastModified, metadata });
      return { etag };
    },
  };
  const store: ReportStore = {
    publicBaseUrl: "https://pub-test.r2.dev",
    async get(key) {
      return objects.get(key) ?? null;
    },
    async head(key) {
      const object = objects.get(key);
      return object ? { ...object, bytes: object.body.length } : null;
    },
    async put(key: string, body: Uint8Array, options: StorePutOptions = {}) {
      await state.beforePut?.(key);
      const existing = objects.get(key);
      if ((options.ifNoneMatch === "*" && existing) || (options.ifMatch && existing?.etag !== options.ifMatch))
        throw new ReportStoreConflictError();
      return state.seed(key, body, state.now, options.metadata);
    },
    async list(prefix) {
      return [...objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, object]) => ({ key, bytes: object.body.length, lastModified: object.lastModified }));
    },
    async delete(keys) {
      await state.beforeDelete?.(keys);
      for (const key of keys) objects.delete(key);
      return keys.length;
    },
  };
  return { store, objects, seed: state.seed, state };
}
