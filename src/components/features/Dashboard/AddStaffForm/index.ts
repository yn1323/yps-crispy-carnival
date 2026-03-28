import { z } from "zod";

export const staffEntrySchema = z.object({
  name: z.string(),
  email: z.union([z.literal(""), z.string().email("正しいメールアドレスを入力してください")]),
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
