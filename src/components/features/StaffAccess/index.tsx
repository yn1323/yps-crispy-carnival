import type { ReactNode } from "react";
import type { StaffAccessKind } from "@/src/domains/staffAccess";
import { type StaffSessionState, useStaffSession } from "./useStaffSession";

type Props = {
  token: string | undefined;
  accessKind: StaffAccessKind;
  children: (state: StaffSessionState) => ReactNode;
};

export function StaffAccessBoundary({ token, accessKind, children }: Props) {
  const state = useStaffSession(token, accessKind);
  return <>{children(state)}</>;
}

export type { StaffAccessKind, StaffLinkUnavailableReason } from "@/src/domains/staffAccess";
export { getStoredSession, type SessionInfo } from "./sessionStorage";
export type StaffAccessState = StaffSessionState;
