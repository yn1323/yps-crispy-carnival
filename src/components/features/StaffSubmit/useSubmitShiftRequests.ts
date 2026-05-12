import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DayEntry } from "./DayCard";

type Session = {
  sessionToken: string;
  recruitmentId: string;
};

export function useSubmitShiftRequests(session: Session) {
  const submitMutation = useMutation(api.shiftSubmission.mutations.submitShiftRequests);

  return async (entries: DayEntry[], acceptedLegal?: boolean) => {
    const requests = entries
      .filter((e) => e.isWorking)
      .map((e) => ({ date: e.date, startTime: e.startTime, endTime: e.endTime }));
    await submitMutation({
      sessionToken: session.sessionToken,
      accessKind: "submit",
      recruitmentId: session.recruitmentId as Id<"recruitments">,
      requests,
      acceptedLegal,
    });
  };
}
