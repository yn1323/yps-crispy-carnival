import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ReissueFormValues } from "@/convex/staffAuth/schemas";

export function useRequestShiftReissue(recruitmentId: string) {
  const requestReissue = useMutation(api.staffAuth.mutations.requestReissue);

  return (values: ReissueFormValues) =>
    requestReissue({
      email: values.email,
      recruitmentId: recruitmentId as Id<"recruitments">,
    });
}
