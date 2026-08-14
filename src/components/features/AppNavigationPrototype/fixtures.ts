import type { ShopContextOption } from "@/src/domains/shop/context";

export const APP_PROTOTYPE_FIXTURE = {
  organization: {
    name: "すーぱーかんぱにー",
    idLabel: "管理用ID",
    createdAt: "2026/8/1",
  },
  currentShop: {
    name: "yn1323店舗",
    staffCount: 3,
  },
  shops: [
    { name: "yn1323店舗", staffCount: 3 },
    { name: "もて", staffCount: 1 },
    { name: "勤務区分", staffCount: 1 },
  ],
  people: [
    {
      name: "yn1323",
      email: "yn1323@example.com",
      initial: "y",
      secondary: "yn1323店舗、もて",
      isManager: true,
      isLineLinked: true,
    },
    {
      name: "staff@example.com",
      email: "staff@example.com",
      initial: "s",
      secondary: "yn1323店舗",
      isManager: false,
      isLineLinked: false,
    },
    {
      name: "くろらぼ",
      email: "crew@example.com",
      initial: "く",
      secondary: "勤務区分",
      isManager: false,
      isLineLinked: false,
    },
  ],
  recruitments: {
    adjusting: [
      { period: "8/17 ～ 8/24", shop: "yn1323店舗", deadline: "締切 8/12済み", submitted: "提出 2/3人" },
      { period: "8/20 ～ 8/27", shop: "もて", deadline: "締切 8/13済み", submitted: "提出 1/5人" },
    ],
    recruiting: { period: "8/26 ～ 8/28", shop: "yn1323店舗", deadline: "締切まで6日", submitted: "提出 0/3人" },
  },
} as const;

export const APP_PROTOTYPE_IDS = {
  person: "sample-person",
  shop: "sample-shop",
  recruitment: "sample-recruitment",
} as const;

export const APP_PROTOTYPE_SHOP_CONTEXTS: readonly ShopContextOption[] = APP_PROTOTYPE_FIXTURE.shops.map(
  (shop, index) => ({
    shopId: index === 0 ? APP_PROTOTYPE_IDS.shop : `sample-shop-${index + 1}`,
    shopName: shop.name,
    shopStatus: "active",
    organizationId: "sample-organization",
    organizationName: APP_PROTOTYPE_FIXTURE.organization.name,
    organizationPlan: "business",
    memberStatus: "active",
  }),
);
