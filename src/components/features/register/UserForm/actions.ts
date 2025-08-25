"use server";

import type { SchemaType } from "./schema";

export const registerUser = async (userId: string, { userName }: SchemaType) => {
  const success = true;

  return { success };
};
