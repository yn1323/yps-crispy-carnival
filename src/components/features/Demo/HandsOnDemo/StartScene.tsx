import { Box, Flex, Icon } from "@chakra-ui/react";
import { LuSend } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

type Props = {
  label: string;
  /** 押せる状態か。送る場面の後ろに置くときは、目立たせる動きを止めて押せなくする。 */
  isActive: boolean;
  onStart: () => void;
};

/** まっさらな画面の中央に、募集を開始するボタンだけを置く。光の輪と光の筋とわずかなふくらみで、押せる場所だと示す。 */
export const StartScene = ({ label, isActive, onStart }: Props) => (
  <Flex h="full" align="center" justify="center" bgGradient="to-b" gradientFrom="teal.50" gradientTo="white" px={6}>
    <Button
      onClick={isActive ? onStart : undefined}
      disabled={!isActive}
      position="relative"
      h={{ base: "64px", lg: "76px" }}
      px={{ base: 8, lg: 12 }}
      borderRadius="full"
      bg="teal.600"
      color="white"
      _hover={{ bg: "teal.700" }}
      _active={{ bg: "teal.800", transform: "scale(.96)" }}
      _disabled={{ opacity: 1, cursor: "default" }}
      fontSize={{ base: "lg", lg: "2xl" }}
      fontWeight="bold"
      gap={3}
      overflow="hidden"
      style={
        isActive ? { animation: "hodHalo 2.4s ease-out infinite, hodBreath 2.4s ease-in-out infinite" } : undefined
      }
    >
      {isActive && (
        <Box
          as="span"
          position="absolute"
          top={0}
          left={0}
          h="full"
          w="36%"
          pointerEvents="none"
          bgGradient="to-r"
          gradientFrom="transparent"
          gradientVia="whiteAlpha.500"
          gradientTo="transparent"
          style={{ animation: "hodShine 2.4s ease-in-out infinite" }}
          aria-hidden
        />
      )}
      <Icon as={LuSend} boxSize={{ base: 5, lg: 6 }} aria-hidden />
      {label}
    </Button>
  </Flex>
);
