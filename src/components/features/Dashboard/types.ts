export type Recruitment = {
  id: string;
  period: { start: string; end: string };
  deadline: string;
  status: "open" | "closed";
  responseCount: number;
  totalStaffCount: number;
};

export type Staff = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
};
