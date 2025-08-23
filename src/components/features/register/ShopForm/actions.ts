"use server";

import type { PostShop } from "@/app/api/shop/route";
import { serverFetch } from "@/src/services/common/serverFetch";
import type { SchemaType } from "./schema";

export const registerShop = async (data: SchemaType) => {
  const { success } = await serverFetch<PostShop>("/api/shop", {
    method: "POST",
    mutation: {
      shopName: data.shopName,
      openTime: data.openTime,
      closeTime: data.closeTime,
      timeUnit: 15,
      submitFrequency: data.submitFrequency,
      avatar: "",
      useTimeCard: false,
    },
  });

  return { success };
};
