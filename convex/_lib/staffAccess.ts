import { v } from "convex/values";

export const staffAccessKindValidator = v.union(v.literal("submit"), v.literal("view"));

export type StaffAccessKind = "submit" | "view";

export function inferAccessKindFromRecruitmentStatus(status: "open" | "confirmed"): StaffAccessKind {
  return status === "open" ? "submit" : "view";
}

export function recruitmentMatchesAccessKind(status: "open" | "confirmed", accessKind: StaffAccessKind): boolean {
  return inferAccessKindFromRecruitmentStatus(status) === accessKind;
}

export function sessionMatchesAccessKind(
  session: { accessKind: StaffAccessKind },
  expectedAccessKind: StaffAccessKind,
): boolean {
  return session.accessKind === expectedAccessKind;
}
