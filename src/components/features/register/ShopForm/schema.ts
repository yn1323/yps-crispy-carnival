import { z } from "zod";
import { SHOP_MAX_LENGTH, SHOP_MIN_LENGTH, SHOP_SUBMIT_FREQUENCY, SHOP_TIME_UNIT } from "@/src/constants/validations";
import { betweenLength, select, time } from "@/src/helpers/validation";

export const timeUnitOptions = SHOP_TIME_UNIT.map((v) => ({
  label: `${v}分単位`,
  value: String(v),
}));

export const submitFrequencyOptions = SHOP_SUBMIT_FREQUENCY.map((v) => ({
  label: v === "1w" ? "1週間ごと" : v === "2w" ? "2週間ごと" : "1ヶ月ごと",
  value: v,
}));

export const schema = z.object({
  shopName: z.string().min(1).superRefine(betweenLength(SHOP_MIN_LENGTH, SHOP_MAX_LENGTH)),
  openTime: z.string().superRefine(time(15)),
  closeTime: z.string().superRefine(time(15)),
  timeUnit: z.string().optional(),
  submitFrequency: z.string().superRefine(select({ options: submitFrequencyOptions, forceSelect: true })),
  useTimeCard: z.boolean().optional(),
  description: z.string().optional(),
});

export type SchemaType = z.infer<typeof schema>;
