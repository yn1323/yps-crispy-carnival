import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useAcceptStaffLegalConsent(token: string) {
  const accept = useMutation(api.legal.mutations.acceptStaffLegalConsent);
  return () => accept({ token, acceptedLegal: true });
}
