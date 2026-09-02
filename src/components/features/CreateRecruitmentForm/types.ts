import type { RegularClosedDay } from "@/convex/shop/schemas";

export type CreateRecruitmentStep = "shop" | "period" | "holidays" | "deadline" | "confirm";

export type CreateRecruitmentShop = {
  shopId: string;
  shopName: string;
};

export type CreateRecruitmentSelectableShop = CreateRecruitmentShop & {
  regularClosedDays: RegularClosedDay[];
};

export type CreateRecruitmentShopTarget =
  | { mode: "fixed"; shop: CreateRecruitmentShop }
  | { mode: "select"; shops: readonly CreateRecruitmentSelectableShop[] };
