import { z } from "zod";
import { staffEntrySchema } from "@/convex/staff/schemas";

export { staffEntrySchema };
export type StaffEntry = z.infer<typeof staffEntrySchema>;

export const addStaffSchema = z
  .object({
    entries: z.array(staffEntrySchema),
  })
  .refine((data) => data.entries.some((e) => e.name.trim() !== ""), {
    message: "少なくとも1人のスタッフ名を入力してください",
    path: ["entries"],
  });

export type AddStaffFormData = z.infer<typeof addStaffSchema>;
