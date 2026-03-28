import { z } from "zod";

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export const step1Schema = z
  .object({
    shopName: z.string().min(1),
    shiftStartTime: z.string().min(1),
    shiftEndTime: z.string().min(1),
  })
  .refine((data) => timeToMinutes(data.shiftEndTime) > timeToMinutes(data.shiftStartTime), {
    message: "終了時間は開始時間より後にしてください",
    path: ["shiftEndTime"],
  });

export type Step1Data = z.infer<typeof step1Schema>;
