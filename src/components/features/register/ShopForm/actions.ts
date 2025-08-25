"use server";

import type { SchemaType } from "./schema";

// biome-ignore lint/correctness/noUnusedFunctionParameters: tmp
export const registerShop = async (data: SchemaType) => {
  const success = true;

  return { success };
};
