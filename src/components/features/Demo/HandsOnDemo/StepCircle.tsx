import { Flex, Icon } from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";

export type StepState = "done" | "current" | "upcoming";

/** 手順の番号の丸。終えた手順はチェック、いまの手順はtealで示す。 */
export const StepCircle = ({ no, state }: { no: number; state: StepState }) => (
  <Flex
    boxSize={6}
    borderRadius="full"
    align="center"
    justify="center"
    flexShrink={0}
    fontSize="xs"
    fontWeight="bold"
    bg={state === "done" ? "green.500" : state === "current" ? "teal.600" : "white"}
    color={state === "upcoming" ? "gray.500" : "white"}
    borderWidth={state === "upcoming" ? "1px" : 0}
    borderColor="gray.300"
  >
    {state === "done" ? <Icon as={LuCheck} boxSize={3.5} aria-hidden /> : no}
  </Flex>
);
