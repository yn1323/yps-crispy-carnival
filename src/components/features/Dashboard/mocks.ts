import type { Recruitment, Staff } from "./types";

export const mockRecruitments: Recruitment[] = [
  {
    id: "rec-1",
    period: { start: "2026-04-01", end: "2026-04-07" },
    deadline: "2026-03-25",
    status: "open",
    responseCount: 3,
    totalStaffCount: 5,
  },
  {
    id: "rec-2",
    period: { start: "2026-04-08", end: "2026-04-14" },
    deadline: "2026-04-01",
    status: "open",
    responseCount: 0,
    totalStaffCount: 5,
  },
];

export const mockStaffs: Staff[] = [
  { id: "s1", name: "田中太郎", email: "tanaka@example.com", role: "admin" },
  { id: "s2", name: "佐藤花子", email: "sato@example.com", role: "staff" },
  { id: "s3", name: "鈴木一郎", email: "suzuki@example.com", role: "staff" },
];
