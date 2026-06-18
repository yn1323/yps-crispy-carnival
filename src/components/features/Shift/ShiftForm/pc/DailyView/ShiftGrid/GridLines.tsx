import { Box } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import type { TimeRange } from "@/src/domains/shift/types";
import { TIME_AXIS_PADDING_PX } from "../../../constants";
import { hourWidthAtom } from "../../../stores";

type GridLinesProps = {
  timeRange: TimeRange;
};

const dashedLinePattern = (width: number, color: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="8" viewBox="0 0 ${width} 8"><line x1="0.5" y1="0" x2="0.5" y2="4" stroke="${color}" stroke-width="1"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

export const GridLines = ({ timeRange }: GridLinesProps) => {
  const hourWidth = useAtomValue(hourWidthAtom);
  const unitWidth = (timeRange.unit / 60) * hourWidth;

  return (
    <Box
      position="absolute"
      inset={0}
      pointerEvents="none"
      zIndex={0}
      style={{
        backgroundImage: [dashedLinePattern(unitWidth, "#e4e4e7"), dashedLinePattern(hourWidth, "#d4d4d8")].join(", "),
        backgroundPosition: `${TIME_AXIS_PADDING_PX}px 0, ${TIME_AXIS_PADDING_PX}px 0`,
        backgroundRepeat: "repeat, repeat",
      }}
    />
  );
};
