import { z } from "zod";

export const staffEntrySchema = z.object({
  name: z.string(),
  email: z.string().refine((val) => val.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
    message: "正しいメールアドレスを入力してください",
  }),
});

export const addStaffSchema = z.object({
  entries: z.array(staffEntrySchema),
});

export type StaffEntry = z.infer<typeof staffEntrySchema>;
export type AddStaffFormData = z.infer<typeof addStaffSchema>;
