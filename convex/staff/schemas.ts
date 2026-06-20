import { z } from "zod";
import { requiredDisplayTextSchema, requiredEmailSchema } from "../_lib/validation";
import { PERSON_NAME_MAX_LENGTH, STAFF_ADD_ENTRIES_MAX } from "../constants";

export const requiredStaffEntrySchema = z.object({
  name: requiredDisplayTextSchema({ label: "名前", maxLength: PERSON_NAME_MAX_LENGTH }),
  email: requiredEmailSchema,
});

export const staffEntrySchema = z
  .object({
    name: z.string(),
    email: z.string(),
  })
  .superRefine((entry, ctx) => {
    const isBlankRow = entry.name.trim() === "" && entry.email.trim() === "";
    if (isBlankRow) return;

    const parsed = requiredStaffEntrySchema.safeParse(entry);
    if (parsed.success) return;

    for (const issue of parsed.error.issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: issue.path,
      });
    }
  })
  .transform((entry) => ({
    name: entry.name.trim(),
    email: entry.email.trim(),
  }));

export const addStaffsSchema = z
  .object({
    entries: z.array(staffEntrySchema).max(STAFF_ADD_ENTRIES_MAX, {
      message: `スタッフは一度に${STAFF_ADD_ENTRIES_MAX}件まで追加できます`,
    }),
  })
  .refine((data) => data.entries.some((e) => e.name !== ""), {
    message: "少なくとも1人のスタッフ名を入力してください",
    path: ["entries"],
  });

export type StaffEntryInput = z.infer<typeof staffEntrySchema>;
export type AddStaffsInput = z.infer<typeof addStaffsSchema>;

export const editStaffSchema = requiredStaffEntrySchema;
export type EditStaffInput = z.infer<typeof editStaffSchema>;
