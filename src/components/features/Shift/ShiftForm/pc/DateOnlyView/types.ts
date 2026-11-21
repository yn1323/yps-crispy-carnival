export type DateInfo = {
  iso: string;
  inRange: boolean;
};

export type WeekItem = {
  key: string;
  label: string;
  subLabel: string;
  dates: DateInfo[];
};
