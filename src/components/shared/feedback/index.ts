import { toaster } from "@/src/components/ui/toaster";
import { getConvexErrorMessage } from "@/src/lib/convex/error";
import { getUserFacingErrorMessage } from "./presentation";

export function showErrorToast(error: unknown): void {
  toaster.create({
    title: getUserFacingErrorMessage(getConvexErrorMessage(error)),
    type: "error",
    duration: Number.POSITIVE_INFINITY,
  });
}

function calcReadingDuration(title: string, description?: string): number {
  const charCount = title.length + (description?.length ?? 0);
  return Math.min(8000, Math.max(2000, charCount * 120));
}

export function showSuccessToast(args: { title: string; description?: string }): void {
  toaster.create({
    ...args,
    type: "success",
    duration: calcReadingDuration(args.title, args.description),
  });
}
