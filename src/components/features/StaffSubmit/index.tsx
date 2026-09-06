import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useRef, useState } from "react";
import { showErrorToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getConvexErrorCode } from "@/src/lib/convex/error";
import { ShiftSubmitPage } from "./ShiftSubmitPage";
import type { SubmitShiftSelectionInput } from "./SubmitForm";
import { SubmitUnavailableView } from "./SubmitUnavailableView";
import type { SubmissionData } from "./types";
import { useSubmitShiftRequests } from "./useSubmitShiftRequests";

export type StaffSubmitSession = {
  sessionToken: string;
  recruitmentId: string;
};

export type StaffSubmitProps = {
  data: SubmissionData;
  session: StaffSubmitSession;
  headerAction?: ReactNode;
};

export function StaffSubmit({ data, session, headerAction }: StaffSubmitProps) {
  const navigate = useNavigate();
  const expectedEditVersion = useRef(data.editVersion ?? 0).current;
  const [hasStaleError, setHasStaleError] = useState(false);
  const submitShiftRequests = useSubmitShiftRequests(session, expectedEditVersion);
  const { run: handleSubmit } = useSingleFlight(
    async (submission: SubmitShiftSelectionInput, acceptedLegal?: boolean) => {
      try {
        await submitShiftRequests(submission, acceptedLegal);
        await navigate({ to: "/shifts/submit/completed", search: { recruitmentId: session.recruitmentId } });
      } catch (error) {
        if (getConvexErrorCode(error) === "RECRUITMENT_CHANGED") setHasStaleError(true);
        else showErrorToast(error);
      }
    },
  );

  return (
    <ShiftSubmitPage data={data} onSubmit={handleSubmit} headerAction={headerAction} hasStaleError={hasStaleError} />
  );
}

export type { SubmitShiftSelectionInput } from "./SubmitForm";
export type { SubmissionData } from "./types";
export { ShiftSubmitPage, SubmitUnavailableView };
