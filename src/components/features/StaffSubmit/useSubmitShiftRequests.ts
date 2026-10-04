import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { SubmitShiftPayload } from "./SubmitForm";

type Session = {
  sessionToken: string;
  recruitmentId: string;
};

export function useSubmitShiftRequests(session: Session, expectedEditVersion: number) {
  const submitMutation = useMutation(api.shiftSubmission.mutations.submitShiftRequests);

  return async ({ submission, dateNotes }: SubmitShiftPayload, acceptedLegal?: boolean) => {
    await submitMutation({
      sessionToken: session.sessionToken,
      accessKind: "submit",
      recruitmentId: session.recruitmentId as Id<"recruitments">,
      submission,
      dateNotes,
      acceptedLegal,
      expectedEditVersion,
    });
  };
}
