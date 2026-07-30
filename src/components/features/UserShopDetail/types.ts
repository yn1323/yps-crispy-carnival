import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type UserShopDetailData = NonNullable<
  FunctionReturnType<typeof api.organization.userDetailQueries.getUserDetail>
>;
export type UserShopDetailMembership = UserShopDetailData["memberships"][number];
export type UserShopDetailRemovalPreview = UserShopDetailData["removalPreview"];

export type UserShopDetailRecruitment = {
  _id: string;
  periodStart: string;
  periodEnd: string;
  deadline: string;
  status: "open" | "confirmed";
  confirmedAt: number | null;
  responseCount: number;
  totalStaffCount: number;
};

export type UserShopDetailDialog = {
  kind: "removeMembership";
  membership: UserShopDetailMembership;
  requestId: string;
} | null;
