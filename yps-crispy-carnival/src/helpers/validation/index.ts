import { z } from "zod";

export const betweenLength = (min: number, max: number) => (val: string, ctx: z.RefinementCtx) => {
  if (val.length < min || val.length > max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${min}〜${max}文字で入力してください`,
    });
  }
};

export const time = (step?: number) => (val: string, ctx: z.RefinementCtx) => {
  if (!val || val.length !== 5 || !val.includes(":")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "時刻を入力してください",
    });
    return;
  }
  const [hour, minute] = val.split(":").map(Number);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "時刻を入力してください",
    });
    return;
  }

  if (step) {
    if (minute % step !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${step}分単位で入力してください`,
      });
      return;
    }
  }
};

export const select =
  ({
    options,
    forceSelect,
  }: {
    options: {
      value: string;
      label: string;
      selected?: boolean;
    }[];
    forceSelect?: boolean;
  }) =>
  (val: string, ctx: z.RefinementCtx) => {
    if (!forceSelect) {
      return;
    }
    if (!val) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "必須項目です",
      });
    } else if (options.every(({ value }) => value !== val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "必須選択です",
      });
    }
  };
