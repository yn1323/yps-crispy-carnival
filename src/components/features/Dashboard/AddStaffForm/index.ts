import { z } from "zod";
import { optionalEmail } from "@/src/helpers/validation";

export const staffEntrySchema = z
  .object({
    name: z.string(),
    email: z.string().superRefine(optionalEmail),
  })
  .refine((entry) => entry.name.trim() !== "" || entry.email.trim() === "", {
    message: "名前を入力してください",
    path: ["name"],
  });

export const addStaffSchema = z
  .object({
    entries: z.array(staffEntrySchema),
  })
  .refine((data) => data.entries.some((e) => e.name.trim() !== ""), {
    message: "少なくとも1人のスタッフ名を入力してください",
    path: ["entries"],
  });

export type StaffEntry = z.infer<typeof staffEntrySchema>;
export type AddStaffFormData = z.infer<typeof addStaffSchema>;
