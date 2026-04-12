import type { Recruitment, Staff } from "./types";

// Storybook用モックデータ。_id は Convex ID の型だが、stories では文字列で代用する
export const mockRecruitments = [
  {
    _id: "rec-1",
    periodStart: "2026-04-20",
    periodEnd: "2026-04-26",
    deadline: "2026-04-18",
    status: "open",
    responseCount: 8,
  },
  {
    _id: "rec-2",
    periodStart: "2026-03-31",
    periodEnd: "2026-04-06",
    deadline: "2026-03-28",
    status: "open",
    responseCount: 10,
  },
  {
    _id: "rec-3",
    periodStart: "2026-03-24",
    periodEnd: "2026-03-30",
    deadline: "2026-03-21",
    status: "confirmed",
    responseCount: 10,
  },
] as unknown as Recruitment[];

export const mockStaffs = [
  { _id: "s1", name: "田中太郎", email: "tanaka@example.com", isOwner: true },
  { _id: "s2", name: "佐藤花子", email: "sato@example.com", isOwner: false },
  { _id: "s3", name: "鈴木一郎", email: "suzuki@example.com", isOwner: false },
] as unknown as Staff[];

export const mockStaffsMany = [
  { _id: "s1", name: "田中太郎", email: "tanaka@example.com", isOwner: true },
  { _id: "s2", name: "佐藤花子", email: "sato@example.com", isOwner: false },
  { _id: "s3", name: "鈴木一郎", email: "suzuki@example.com", isOwner: false },
  { _id: "s4", name: "山田美咲", email: "yamada@example.com", isOwner: false },
  { _id: "s5", name: "高橋健太", email: "takahashi@example.com", isOwner: false },
  { _id: "s6", name: "伊藤麻衣", email: "ito@example.com", isOwner: false },
  { _id: "s7", name: "渡辺翔太", email: "watanabe@example.com", isOwner: false },
  { _id: "s8", name: "中村由美", email: "nakamura@example.com", isOwner: false },
  { _id: "s9", name: "小林大輔", email: "kobayashi@example.com", isOwner: false },
  { _id: "s10", name: "加藤彩", email: "kato@example.com", isOwner: false },
] as unknown as Staff[];
