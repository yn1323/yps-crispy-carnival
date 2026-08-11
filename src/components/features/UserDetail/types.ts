import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type UserDetailPanel = "basic" | "addShop";

export type UserDetailReturnTo = "dashboard" | "settings" | "shopDetail";

export type UserDetailData = NonNullable<FunctionReturnType<typeof api.organization.userDetailQueries.getUserDetail>>;

export type UserMembershipChangeInput = Omit<
  FunctionArgs<typeof api.staff.mutations.changeOrganizationPersonShopMemberships>,
  "personId"
>;

export type UserDetailRemovalPreview = UserDetailData["removalPreview"];

export type UserDetailDialog =
  | {
      kind: "removeManagerRole";
      personId: UserDetailData["person"]["id"];
      shopId: UserDetailData["shops"][number]["shopId"];
      requestId: string;
    }
  | {
      kind: "removePerson";
      personId: UserDetailData["person"]["id"];
      shopId: UserDetailData["shops"][number]["shopId"];
      removalPreview: UserDetailRemovalPreview;
      requestId: string;
    }
  | null;
