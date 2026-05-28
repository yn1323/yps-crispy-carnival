const FIXED_STORYBOOK_NOW = new Date("2026-04-30T15:00:00.000Z").getTime();

type FixedDateConstructor = DateConstructor & {
  __storybookFixedDate?: true;
};

type DateConstructorArgs =
  | []
  | [value: string | number | Date]
  | [year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number];

export function applyFixedStorybookDate() {
  const CurrentDate = globalThis.Date as FixedDateConstructor;
  if (CurrentDate.__storybookFixedDate) return;

  const RealDate = CurrentDate;

  function StorybookFixedDate(...args: DateConstructorArgs) {
    if (!new.target) {
      return new RealDate(FIXED_STORYBOOK_NOW).toString();
    }

    if (args.length === 0) {
      return new RealDate(FIXED_STORYBOOK_NOW);
    }

    if (args.length === 1) {
      return new RealDate(args[0] as string | number);
    }

    return new RealDate(...args);
  }

  Object.setPrototypeOf(StorybookFixedDate, RealDate);
  StorybookFixedDate.prototype = RealDate.prototype;
  Object.defineProperty(StorybookFixedDate, "now", {
    value: () => FIXED_STORYBOOK_NOW,
  });
  Object.defineProperty(StorybookFixedDate, "__storybookFixedDate", {
    value: true,
  });

  globalThis.Date = StorybookFixedDate as FixedDateConstructor;
}
