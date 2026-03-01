import { Flex } from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";
import { POSITION_COLORS } from "@/convex/constants";

type Props = {
  value: string;
  onChange: (color: string) => void;
  colors?: readonly string[];
};

export const ColorPicker = ({ value, onChange, colors = POSITION_COLORS }: Props) => {
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
