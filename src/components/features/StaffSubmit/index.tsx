import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
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
  const submitShiftRequests = useSubmitShiftRequests(session);
  const { run: handleSubmit } = useSingleFlight(
    async (submission: SubmitShiftSelectionInput, acceptedLegal?: boolean) => {
      await submitShiftRequests(submission, acceptedLegal);
      await navigate({ to: "/shifts/submit/completed", search: { shopName: data.shopName } });
    },
  );

  return <ShiftSubmitPage data={data} onSubmit={handleSubmit} headerAction={headerAction} />;
}

export type { SubmitShiftSelectionInput } from "./SubmitForm";
export type { SubmissionData } from "./types";
export { ShiftSubmitPage, SubmitUnavailableView };
