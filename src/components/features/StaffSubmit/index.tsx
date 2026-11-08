import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useRef, useState } from "react";
import { showErrorToast } from "@/src/components/shared/feedback";
import { getInclusiveDateCount, todayJST } from "@/src/domains/shift/date";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getConvexErrorCode } from "@/src/lib/convex/error";
import { trackAppError, trackProductEvent } from "@/src/lib/webMeasurement";
import { ShiftSubmitPage } from "./ShiftSubmitPage";
import type { SubmitShiftPayload } from "./SubmitForm";
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

function trackShiftSubmit(data: SubmissionData, payload: SubmitShiftPayload) {
  const today = todayJST();
  trackProductEvent({
    kind: "shift_submit",
    isResubmit: data.hasSubmitted,
    usedPreviousPattern: payload.usedPreviousPattern === true,
    daysBeforeDeadline: data.deadline >= today ? getInclusiveDateCount(today, data.deadline) - 1 : -1,
    submissionPattern: data.submissionPattern.kind,
    hasDateNotes: payload.dateNotes.length > 0,
  });
}

export function StaffSubmit({ data, session, headerAction }: StaffSubmitProps) {
  const navigate = useNavigate();
  const expectedEditVersion = useRef(data.editVersion ?? 0).current;
  const [hasStaleError, setHasStaleError] = useState(false);
  const submitShiftRequests = useSubmitShiftRequests(session, expectedEditVersion);
  const { run: handleSubmit } = useSingleFlight(async (payload: SubmitShiftPayload, acceptedLegal?: boolean) => {
    try {
      await submitShiftRequests(payload, acceptedLegal);
      trackShiftSubmit(data, payload);
      await navigate({ to: "/shifts/submit/completed", search: { recruitmentId: session.recruitmentId } });
    } catch (error) {
      if (getConvexErrorCode(error) === "RECRUITMENT_CHANGED") {
        trackAppError("section", error);
        setHasStaleError(true);
      } else showErrorToast(error);
    }
  });

  return (
    <ShiftSubmitPage data={data} onSubmit={handleSubmit} headerAction={headerAction} hasStaleError={hasStaleError} />
  );
}

export type { SubmitShiftPayload, SubmitShiftSelectionInput } from "./SubmitForm";
export type { SubmissionData } from "./types";
export { ShiftSubmitPage, SubmitUnavailableView };
