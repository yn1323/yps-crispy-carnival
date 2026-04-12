import dayjs from "dayjs";
import type { Id } from "@/convex/_generated/dataModel";

export type Recruitment = {
  _id: Id<"recruitments">;
  periodStart: string;
  periodEnd: string;
  deadline: string;
  status: "open" | "confirmed";
  responseCount: number;
  totalStaffCount: number;
};

export type RecruitmentDisplayStatus = "collecting" | "past-deadline" | "confirmed";

export function getDisplayStatus(recruitment: Pick<Recruitment, "status" | "deadline">): RecruitmentDisplayStatus {
  if (recruitment.status === "confirmed") return "confirmed";
  const today = dayjs().format("YYYY-MM-DD");
  return recruitment.deadline < today ? "past-deadline" : "collecting";
}

export type Staff = {
  _id: Id<"staffs">;
  name: string;
  email: string;
  isOwner: boolean;
};
