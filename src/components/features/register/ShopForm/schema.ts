import { z } from "zod";
import {
  SHOP_MAX_LENGTH,
  SHOP_MIN_LENGTH,
  SHOP_SUBMIT_FREQUENCY,
  type ShopTimeUnitType,
} from "@/src/constants/validations";
import { betweenLength, select, time } from "@/src/helpers/validation";

export const submitFrequencyOptions = SHOP_SUBMIT_FREQUENCY.map((v) => ({
  label: v === "1w" ? "1週間ごと" : v === "2w" ? "2週間ごと" : "1ヶ月ごと",
  value: v,
}));

export const schema = z.object({
  shopName: z.string().min(1, "店舗名を入力してください").superRefine(betweenLength(SHOP_MIN_LENGTH, SHOP_MAX_LENGTH)),
  openTime: z.string().superRefine(time(15 as ShopTimeUnitType)),
  closeTime: z.string().superRefine(time(15 as ShopTimeUnitType)),
  submitFrequency: z.string().superRefine(select({ options: submitFrequencyOptions, forceSelect: true })),
});

export type SchemaType = z.infer<typeof schema>;
