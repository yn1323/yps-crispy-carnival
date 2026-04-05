import type { z } from "zod";
import { staffEntrySchema } from "@/convex/staff/schemas";

export const editStaffSchema = staffEntrySchema.refine((data) => data.name.trim() !== "", {
  message: "名前を入力してください",
  path: ["name"],
});

export type EditStaffFormData = z.infer<typeof editStaffSchema>;
