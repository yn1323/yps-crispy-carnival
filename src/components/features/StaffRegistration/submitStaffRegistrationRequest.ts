import type { SubmitStaffRegistrationInput } from "@/convex/staffRegistration/schemas";
import { CONVEX_SITE_URL } from "@/src/configs/publicEnv";

export type StaffRegistrationSubmitData = SubmitStaffRegistrationInput;

export async function submitStaffRegistrationRequest(data: StaffRegistrationSubmitData): Promise<void> {
  const response = await fetch(`${CONVEX_SITE_URL}/staff-registration/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = (await response.json().catch(() => null)) as { error?: string; status?: string } | null;
  if (!response.ok || body?.status !== "accepted") {
    throw new Error(body?.error ?? "スタッフ登録を申請できませんでした。少し時間をおいてお試しください");
  }
}
