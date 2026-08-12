import dayjs, { type Dayjs } from "dayjs";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { getRecruitmentDeadlineDays, getRecruitmentLifecycleStatus } from "@/src/domains/shift/recruitmentLifecycle";

export type NextAction =
  | { kind: "past-deadline"; recruitment: Recruitment }
  | { kind: "deadline-today"; recruitment: Recruitment }
  | { kind: "deadline-soon"; recruitment: Recruitment; daysLeft: number }
  | { kind: "collecting"; recruitment: Recruitment; daysLeft: number }
  | { kind: "idle" };

const SOON_THRESHOLD_DAYS = 3;

export function pickNextAction(recruitments: Recruitment[], now: Dayjs = dayjs()): NextAction {
  const todayStr = now.format("YYYY-MM-DD");

  const open = recruitments
    .map((recruitment) => ({
      recruitment,
      lifecycleStatus: getRecruitmentLifecycleStatus(recruitment, todayStr),
    }))
    .filter(({ lifecycleStatus }) => lifecycleStatus === "collecting" || lifecycleStatus === "action-required");

  const past = open
    .filter(({ lifecycleStatus }) => lifecycleStatus === "action-required")
    .map(({ recruitment }) => recruitment)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.periodStart.localeCompare(b.periodStart));
  if (past.length > 0) return { kind: "past-deadline", recruitment: past[0] };

  const upcoming = open
    .filter(({ lifecycleStatus }) => lifecycleStatus === "collecting")
    .map(({ recruitment }) => ({
      r: recruitment,
      daysLeft: getRecruitmentDeadlineDays(recruitment.deadline, todayStr),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const top = upcoming[0];
  if (top) {
    if (top.daysLeft === 0) return { kind: "deadline-today", recruitment: top.r };
    if (top.daysLeft <= SOON_THRESHOLD_DAYS)
      return { kind: "deadline-soon", recruitment: top.r, daysLeft: top.daysLeft };
    return { kind: "collecting", recruitment: top.r, daysLeft: top.daysLeft };
  }

  return { kind: "idle" };
}
