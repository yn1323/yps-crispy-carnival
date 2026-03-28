import type { Recruitment, Staff } from "./types";

export const mockRecruitments: Recruitment[] = [
  {
    id: "rec-1",
    period: { start: "2026-03-31", end: "2026-04-06" },
    deadline: "2026-03-28",
    status: "open",
    responseCount: 8,
    totalStaffCount: 10,
  },
  {
    id: "rec-2",
    period: { start: "2026-03-24", end: "2026-03-30" },
    deadline: "2026-03-21",
    status: "confirmed",
    responseCount: 10,
    totalStaffCount: 10,
  },
];

export const mockStaffs: Staff[] = [
  { id: "s1", name: "田中太郎", email: "tanaka@example.com", role: "admin" },
  { id: "s2", name: "佐藤花子", email: "sato@example.com", role: "staff" },
  { id: "s3", name: "鈴木一郎", email: "suzuki@example.com", role: "staff" },
];
