export type ManagerInvitationStaffCandidate = {
  id: string;
  name: string;
  email: string;
  shopNames: string[];
  isResend: boolean;
};

export type ManagerInvitationSubmitInput =
  | { kind: "person"; personId: string }
  | { kind: "external"; name: string; email: string };
