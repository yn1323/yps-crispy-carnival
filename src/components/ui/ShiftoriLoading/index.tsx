import { Box, type BoxProps, Image, type ImageProps, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

type ShiftoriLoadingVariant = "page" | "section" | "compact";

type Props = Omit<BoxProps, "children"> & {
  variant?: ShiftoriLoadingVariant;
  message?: ReactNode;
  minH?: BoxProps["minH"];
  logoSize?: ImageProps["boxSize"];
  animated?: boolean;
};

const VARIANT_STYLES: Record<
  ShiftoriLoadingVariant,
  {
    minH: BoxProps["minH"];
    logoSize: ImageProps["boxSize"];
    gap: BoxProps["gap"];
    fontSize: BoxProps["fontSize"];
  }
> = {
  page: {
    minH: "100vh",
    logoSize: { base: "64px", md: "80px" },
    gap: 4,
    fontSize: "md",
  },
  section: {
    minH: "400px",
    logoSize: "64px",
    gap: 3,
    fontSize: "sm",
  },
  compact: {
    minH: "160px",
    logoSize: "44px",
    gap: 2,
    fontSize: "sm",
  },
};

export const ShiftoriLoading = ({
  variant = "section",
  message = "Loading...",
  minH,
  logoSize,
  animated = true,
  ...props
}: Props) => {
  const styles = VARIANT_STYLES[variant];

  return (
    <Box
      role="status"
      aria-live="polite"
      display="flex"
      justifyContent="center"
      alignItems="center"
      minH={minH ?? styles.minH}
      w="full"
      {...props}
    >
      <Stack align="center" textAlign="center" gap={styles.gap}>
        <Image
          src="/logo192.webp"
          alt="シフトリ"
          boxSize={logoSize ?? styles.logoSize}
          objectFit="contain"
          animation={animated ? "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" : undefined}
          _motionReduce={{ animation: "none" }}
        />
        <Text fontSize={styles.fontSize} fontWeight="semibold" color="fg.muted" letterSpacing="0">
          {message}
        </Text>
      </Stack>
    </Box>
  );
};
