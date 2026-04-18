import dayjs, { type Dayjs } from "dayjs";
import type { Recruitment } from "@/src/components/features/Dashboard/types";

export type NextAction =
  | { kind: "past-deadline"; recruitment: Recruitment }
  | { kind: "deadline-today"; recruitment: Recruitment }
  | { kind: "deadline-soon"; recruitment: Recruitment; daysLeft: number }
  | { kind: "idle" };

const SOON_THRESHOLD_DAYS = 3;

export function pickNextAction(recruitments: Recruitment[], now: Dayjs = dayjs()): NextAction {
  const today = now.startOf("day");
  const todayStr = today.format("YYYY-MM-DD");

  const open = recruitments.filter((r) => r.status === "open");

  const past = open.filter((r) => r.deadline < todayStr).sort((a, b) => a.deadline.localeCompare(b.deadline));
  if (past.length > 0) return { kind: "past-deadline", recruitment: past[0] };

  const upcoming = open
    .map((r) => ({ r, daysLeft: dayjs(r.deadline).startOf("day").diff(today, "day") }))
    .filter((x) => x.daysLeft >= 0 && x.daysLeft <= SOON_THRESHOLD_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const top = upcoming[0];
  if (top) {
    if (top.daysLeft === 0) return { kind: "deadline-today", recruitment: top.r };
    return { kind: "deadline-soon", recruitment: top.r, daysLeft: top.daysLeft };
  }

  return { kind: "idle" };
}
