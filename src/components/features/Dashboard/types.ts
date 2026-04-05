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

export type Staff = {
  _id: Id<"staffs">;
  name: string;
  email: string;
};
