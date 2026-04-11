import type { Recruitment, Staff } from "./types";

// Storybook用モックデータ。_id は Convex ID の型だが、stories では文字列で代用する
export const mockRecruitments = [
  {
    _id: "rec-1",
    periodStart: "2026-03-31",
    periodEnd: "2026-04-06",
    deadline: "2026-03-28",
    status: "open",
    responseCount: 8,
    totalStaffCount: 10,
  },
  {
    _id: "rec-2",
    periodStart: "2026-03-24",
    periodEnd: "2026-03-30",
    deadline: "2026-03-21",
    status: "confirmed",
    responseCount: 10,
    totalStaffCount: 10,
  },
] as unknown as Recruitment[];

export const mockStaffs = [
  { _id: "s1", name: "田中太郎", email: "tanaka@example.com", isOwner: true },
  { _id: "s2", name: "佐藤花子", email: "sato@example.com", isOwner: false },
  { _id: "s3", name: "鈴木一郎", email: "suzuki@example.com", isOwner: false },
] as unknown as Staff[];
