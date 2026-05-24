import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { SubmitShiftSelectionInput } from "./SubmitFormView";

type Session = {
  sessionToken: string;
  recruitmentId: string;
};

export function useSubmitShiftRequests(session: Session) {
  const submitMutation = useMutation(api.shiftSubmission.mutations.submitShiftRequests);

  return async (submission: SubmitShiftSelectionInput, acceptedLegal?: boolean) => {
    await submitMutation({
      sessionToken: session.sessionToken,
      accessKind: "submit",
      recruitmentId: session.recruitmentId as Id<"recruitments">,
      submission,
      acceptedLegal,
    });
  };
}
