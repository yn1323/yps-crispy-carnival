import { Box, type BoxProps, Circle, Icon, Stack, Text } from "@chakra-ui/react";
import { type ElementType, isValidElement, type ReactElement, type ReactNode } from "react";

type EmptyTone = "neutral" | "brand" | "success" | "warning" | "danger";
type EmptyVariant = "plain" | "section";
type EmptyIconVariant = "simple" | "circle";
type EmptySize = "md" | "lg";

type Props = Omit<BoxProps, "title"> & {
  icon?: ElementType | ReactElement;
  title: ReactNode;
  description?: ReactNode;
  secondaryDescription?: ReactNode;
  action?: ReactNode;
  tone?: EmptyTone;
  variant?: EmptyVariant;
  iconVariant?: EmptyIconVariant;
  size?: EmptySize;
  contentMaxW?: BoxProps["maxW"];
};

const TONE_STYLES: Record<
  EmptyTone,
  {
    iconColor: string;
    circleBg: string;
    circleColor: string;
    sectionBg: string;
    sectionBorder: string;
  }
> = {
  neutral: {
    iconColor: "fg.subtle",
    circleBg: "gray.100",
    circleColor: "gray.600",
    sectionBg: "gray.50",
    sectionBorder: "gray.200",
  },
  brand: {
    iconColor: "teal.500",
    circleBg: "teal.600",
    circleColor: "white",
    sectionBg: "teal.50/50",
    sectionBorder: "teal.100",
  },
  success: {
    iconColor: "green.500",
    circleBg: "green.500",
    circleColor: "white",
    sectionBg: "green.50",
    sectionBorder: "green.100",
  },
  warning: {
    iconColor: "orange.500",
    circleBg: "orange.50",
    circleColor: "orange.500",
    sectionBg: "orange.50",
    sectionBorder: "orange.100",
  },
  danger: {
    iconColor: "red.500",
    circleBg: "red.50",
    circleColor: "red.500",
    sectionBg: "red.50",
    sectionBorder: "red.100",
  },
};

function renderIcon(icon: ElementType | ReactElement, boxSize: number) {
  if (isValidElement(icon)) return icon;
  return <Icon as={icon} boxSize={boxSize} />;
}

export const Empty = ({
  icon,
  title,
  description,
  secondaryDescription,
  action,
  tone = "neutral",
  variant = "plain",
  iconVariant = "simple",
  size = "md",
  minH,
  contentMaxW = "380px",
  ...props
}: Props) => {
  const styles = TONE_STYLES[tone];
  const iconBoxSize = size === "lg" ? 8 : 12;
  const resolvedMinH = minH ?? (variant === "section" ? undefined : "400px");

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minH={resolvedMinH}
      w="full"
      py={variant === "section" ? { base: 10, lg: 12 } : undefined}
      px={variant === "section" ? 6 : undefined}
      borderRadius={variant === "section" ? "xl" : undefined}
      borderStyle={variant === "section" ? "dashed" : undefined}
      borderWidth={variant === "section" ? "1.5px" : undefined}
      borderColor={variant === "section" ? styles.sectionBorder : undefined}
      bg={variant === "section" ? styles.sectionBg : undefined}
      {...props}
    >
      <Stack align="center" textAlign="center" gap={3} maxW={contentMaxW}>
        {icon &&
          (iconVariant === "circle" ? (
            <Circle size="64px" bg={styles.circleBg} color={styles.circleColor} fontSize="3xl">
              {renderIcon(icon, iconBoxSize)}
            </Circle>
          ) : (
            <Box color={styles.iconColor} fontSize="3xl">
              {renderIcon(icon, iconBoxSize)}
            </Box>
          ))}
        <Stack gap={1.5} align="center">
          <Text
            as="h2"
            fontSize={size === "lg" ? "xl" : "lg"}
            fontWeight={size === "lg" ? "bold" : "semibold"}
            color="gray.900"
            whiteSpace="pre-line"
          >
            {title}
          </Text>
          {description && (
            <Text fontSize="sm" color="fg.muted" lineHeight="tall" whiteSpace="pre-line">
              {description}
            </Text>
          )}
          {secondaryDescription && (
            <Text fontSize="xs" color="fg.subtle" lineHeight="tall" whiteSpace="pre-line">
              {secondaryDescription}
            </Text>
          )}
        </Stack>
        {action}
      </Stack>
    </Box>
  );
};
