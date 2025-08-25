"use server";

import type { SchemaType } from "./schema";

// biome-ignore lint/correctness/noUnusedFunctionParameters: temp
export const registerUser = async (userId: string, { userName }: SchemaType) => {
  const success = true;

  return { success };
};
