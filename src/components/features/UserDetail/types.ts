import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type UserDetailPanel = "basic" | "addShop" | "shop";

export type UserDetailReturnTo = "dashboard" | "settings" | "shopDetail";

export type UserDetailData = NonNullable<FunctionReturnType<typeof api.organization.userDetailQueries.getUserDetail>>;

export type UserDetailMembership = UserDetailData["memberships"][number];

export type UserDetailRecruitment = {
  _id: string;
  periodStart: string;
  periodEnd: string;
  status: "open" | "confirmed";
};

export type UserDetailDialog =
  | { kind: "removeManagerRole" }
  | { kind: "removeMembership"; membership: UserDetailMembership }
  | { kind: "removePerson" }
  | null;
