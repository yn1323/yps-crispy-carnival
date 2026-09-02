import dayjs from "dayjs";

export type RecruitmentLifecycleStatus =
  | "collecting"
  | "action-required"
  | "current"
  | "confirmed"
  | "ended"
  | "ended-unconfirmed";

type RecruitmentLifecycleInput = {
  status: "open" | "confirmed";
  deadline: string;
  periodStart: string;
  periodEnd: string;
};

export function getRecruitmentLifecycleStatus(
  recruitment: RecruitmentLifecycleInput,
  today: string,
): RecruitmentLifecycleStatus {
  if (recruitment.periodEnd < today) {
    return recruitment.status === "confirmed" ? "ended" : "ended-unconfirmed";
  }
  if (recruitment.status === "open" && recruitment.deadline < today) return "action-required";
  if (recruitment.status === "confirmed" && recruitment.periodStart <= today && today <= recruitment.periodEnd) {
    return "current";
  }
  return recruitment.status === "confirmed" ? "confirmed" : "collecting";
}

export function getRecruitmentDeadlineDays(deadline: string, today: string): number {
  return dayjs(deadline).startOf("day").diff(dayjs(today).startOf("day"), "day");
}
