import { Button, Flex } from "@chakra-ui/react";
import type { ReactNode } from "react";

type QuickNavBarProps = {
  periods: { label: string; id: string }[];
  activePeriod?: string;
  children?: ReactNode;
};

export const QuickNavBar = ({ periods, activePeriod, children }: QuickNavBarProps) => {
  const handleClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (periods.length <= 1 && !children) return null;

  return (
    <Flex
      display={{ base: "flex", md: "none" }}
      position="fixed"
      bottom="60px"
      left={0}
      right={0}
      justify="center"
      align="center"
      gap={1}
      px={3}
      py={2}
      bg="white"
      borderTopWidth="1px"
      borderColor="gray.200"
      boxShadow="0 -2px 8px rgba(0, 0, 0, 0.08)"
      zIndex={10}
      h="48px"
    >
      <Flex flex={1} justify="center" gap={1}>
        {periods.map((period) => (
          <Button
            key={period.id}
            size="xs"
            variant={activePeriod === period.id ? "solid" : "outline"}
            colorPalette={activePeriod === period.id ? "teal" : "gray"}
            onClick={() => handleClick(period.id)}
            borderRadius="full"
            fontSize="xs"
          >
            {period.label}
          </Button>
        ))}
      </Flex>
      {children}
    </Flex>
  );
};
