import { Flex } from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";

const DEFAULT_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
] as const;

type Props = {
  value: string;
  onChange: (color: string) => void;
  colors?: readonly string[];
};

export const ColorPicker = ({ value, onChange, colors = DEFAULT_COLORS }: Props) => {
  return (
    <Flex gap={1.5} flexWrap="wrap">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            backgroundColor: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            border: value === color ? "2px solid #374151" : "2px solid transparent",
            padding: 0,
          }}
        >
          {value === color && <LuCheck color="white" size={14} />}
        </button>
      ))}
    </Flex>
  );
};
