import type { SubmitContactInput } from "@/convex/contact/schemas";
import { CONVEX_SITE_URL } from "@/src/configs/publicEnv";

export type ContactSubmitData = Omit<SubmitContactInput, "turnstileToken" | "requestId"> & {
  turnstileToken: string;
  requestId: string;
};

export async function submitContactRequest(data: ContactSubmitData): Promise<void> {
  const response = await fetch(`${CONVEX_SITE_URL}/contact/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = (await response.json().catch(() => null)) as { error?: string; status?: string } | null;
  if (!response.ok || body?.status !== "accepted") {
    throw new Error(body?.error ?? "問い合わせを送信できませんでした。少し時間をおいてお試しください");
  }
}
