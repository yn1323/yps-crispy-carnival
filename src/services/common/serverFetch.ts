import type { RequestInit } from "next/dist/server/web/spec-extension/request";
import { cookies, headers } from "next/headers";
import { getEnv } from "@/src/helpers/utils/env";

export const makePath = async (path: string) => {
  const scheme = process.env.NEXT_PUBLIC_IS_LOCAL || process.env.CI ? "http" : "https";
  // biome-ignore lint/suspicious/noExplicitAny: temp
  const host = ((await headers()) as any).get("host");
  return `${scheme}://${host}${path[0] === "/" ? "" : "/"}${path}`;
};

export type BaseFetch = {
  response: unknown;
  requestOptions?: {
    cache?: RequestInit["cache"];
    next?: {
      tags?: string[];
      revalidate?: number;
    };
  };
} & XOR<
  {
    method?: "GET";
    query?: Record<string, unknown>;
  },
  {
    method?: "POST" | "PUT" | "PATCH" | "DELETE";
    mutation?: Record<string, unknown>;
  }
>;

type ServerFetchOptions = {
  method?: BaseFetch["method"];
  query?: BaseFetch["query"];
  mutation?: BaseFetch["mutation"];
  options?: BaseFetch["requestOptions"];
};

const baseFetch = async <T extends BaseFetch>(path: string, options?: ServerFetchOptions): Promise<T["response"]> => {
  const method = options?.method ?? "GET";
  const query = options?.query ?? {};
  const mutation = options?.mutation ?? {};

  const targetUrl =
    method === "GET" && query && Object.keys(query).length > 0
      ? `${await makePath(path)}?${Object.entries(query)
          .map(([key, value]) => `${key}=${value}`)
          .join("&")}`
      : await makePath(path);

  const body = method === "GET" ? {} : { body: JSON.stringify(mutation) };

  const cache = { cache: options?.options?.cache ?? "no-store" };
  const next = { next: options?.options?.next ?? {} };

  const { IS_LOCAL } = getEnv();

  // 認証情報（Cookie）を取得
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const res = await fetch(targetUrl, {
    method,
    ...body,
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader && { Cookie: cookieHeader }),
    },
    ...(IS_LOCAL ? { cache: "no-store" } : options?.options?.next ? next : cache),
  });
  if (!res.ok) {
    console.error("Failed fetch: ", targetUrl, "Status:", res.status);
    return {};
  }
  const json: T["response"] = await res.json().catch((e) => {
    console.error("Failed fetch: ", targetUrl);
    console.error(e);
    return {};
  });
  return json ?? {};
};

export const serverFetch = async <T extends BaseFetch>(
  path: string,
  options?: ServerFetchOptions,
): Promise<T["response"]> => {
  return await baseFetch(path, options);
};
