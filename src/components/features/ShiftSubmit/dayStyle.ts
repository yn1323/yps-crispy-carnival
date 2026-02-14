import dayjs from "dayjs";

export type DayPalette = "red" | "blue" | "teal";

type DayStyle = {
  palette: DayPalette;
  borderColor: string;
  textColor: string;
};

export const getDayStyle = (date: string): DayStyle => {
  const day = dayjs(date).day();

  if (day === 0) {
    return {
      palette: "red",
      borderColor: "red.300",
      textColor: "red.600",
    };
  }

  if (day === 6) {
    return {
      palette: "blue",
      borderColor: "blue.300",
      textColor: "blue.600",
    };
  }

  return {
    palette: "teal",
    borderColor: "teal.300",
    textColor: "teal.600",
  };
};
