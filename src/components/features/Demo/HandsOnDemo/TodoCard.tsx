import { Box, Flex, Portal, Text } from "@chakra-ui/react";
import { StepCircle } from "./StepCircle";

type Props = {
  labels: string[];
  current: number;
  /** くわしく表示では、表の下の必要人数の帯を隠さないよう、PCでは上へずらす。 */
  raised: boolean;
  zIndex: number;
};

/** 右下に、シフト表でやることを並べる。終えた手順にはチェックを付け、いまの手順を太字にする。 */
export const TodoCard = ({ labels, current, raised, zIndex }: Props) => (
  <Portal>
    <Box
      as="section"
      aria-label="やること"
      position="fixed"
      right={{ base: 3, lg: 6 }}
      left={{ base: 3, lg: "auto" }}
      bottom={{ base: 3, lg: raised ? 28 : 6 }}
      zIndex={zIndex}
      w={{ base: "auto", lg: "248px" }}
      bg="white"
      borderRadius="xl"
      borderWidth="1px"
      borderColor="gray.200"
      boxShadow="lg"
      px={4}
      py={3}
    >
      <Text fontSize="xs" fontWeight="bold" color="gray.500">
        やること
      </Text>
      <Flex as="ol" direction="column" gap={2} mt={2} listStyleType="none">
        {labels.map((label, index) => {
          const state = index < current ? "done" : index === current ? "current" : "upcoming";
          return (
            <Flex as="li" key={label} align="center" gap={2.5} aria-current={state === "current" ? "step" : undefined}>
              <StepCircle no={index + 1} state={state} />
              <Text
                fontSize="sm"
                fontWeight={state === "current" ? "bold" : "medium"}
                color={state === "current" ? "gray.900" : "gray.500"}
                textDecoration={state === "done" ? "line-through" : "none"}
              >
                {label}
              </Text>
            </Flex>
          );
        })}
      </Flex>
    </Box>
  </Portal>
);
