import { Box, Dialog as ChakraDialog, Circle, Flex, HStack, Icon, Portal, Text } from "@chakra-ui/react";
import { useCallback, useState } from "react";
import { LuArrowRight, LuCheck } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { Step1Data } from "./SetupStep1";
import { SetupStep1 } from "./SetupStep1/index.tsx";
import type { Step2Data } from "./SetupStep2";
import { SetupStep2 } from "./SetupStep2/index.tsx";

export type SetupData = Step1Data & Step2Data;

type Props = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onComplete: (data: SetupData) => void;
  managerProfileDefaults?: Pick<Step2Data, "name" | "email">;
};

const INITIAL_STEP1: Step1Data = { shopName: "", submissionPattern: { kind: "dateOnly" } };

const Stepper = ({ currentStep }: { currentStep: 1 | 2 }) => (
  <HStack width="full" gap={0} py={3}>
    <HStack gap={2} flexShrink={0}>
      <Circle size={7} bg="teal.solid" color="white" fontSize="xs" fontWeight="semibold">
        {currentStep > 1 ? <Icon as={LuCheck} boxSize={4} /> : "1"}
      </Circle>
      <Text fontSize="sm" fontWeight="semibold" color="teal.solid">
        お店の情報
      </Text>
    </HStack>
    <Box flex={1} h="2px" bg={currentStep > 1 ? "teal.solid" : "gray.200"} mx={1} />
    <HStack gap={2} flexShrink={0}>
      <Circle
        size={7}
        bg={currentStep >= 2 ? "teal.solid" : "gray.200"}
        color={currentStep >= 2 ? "white" : "fg.subtle"}
        fontSize="xs"
        fontWeight="semibold"
      >
        2
      </Circle>
      <Text
        fontSize="sm"
        fontWeight={currentStep >= 2 ? "semibold" : "normal"}
        color={currentStep >= 2 ? "teal.solid" : "fg.subtle"}
      >
        あなたの名前
      </Text>
    </HStack>
  </HStack>
);

export const SetupModal = ({ isOpen, onOpenChange, onComplete, managerProfileDefaults }: Props) => {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [step1Data, setStep1Data] = useState<Step1Data>(INITIAL_STEP1);

  const handleStep1Next = useCallback((data: Step1Data) => {
    setStep1Data(data);
    setCurrentStep(2);
  }, []);

  const handleStep2Submit = useCallback(
    (data: Step2Data) => {
      onComplete({ ...step1Data, ...data });
    },
    [onComplete, step1Data],
  );

  const handleBack = useCallback(() => {
    setCurrentStep(1);
  }, []);

  const handleOpenChange = useCallback(
    (details: { open: boolean }) => {
      // 強制モーダル: 閉じれない
      if (!details.open) return;
      onOpenChange(details);
    },
    [onOpenChange],
  );

  const title = currentStep === 1 ? "お店の情報を登録" : "あなたの名前を登録";

  return (
    <ChakraDialog.Root open={isOpen} onOpenChange={handleOpenChange} placement="center" closeOnInteractOutside={false}>
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner p={0}>
          <ChakraDialog.Content
            w="100vw"
            h="100dvh"
            maxW="100vw"
            maxH="100dvh"
            borderRadius={0}
            display="flex"
            flexDirection="column"
            overflow="hidden"
          >
            <ChakraDialog.Header flexShrink={0} p={0} borderBottomWidth={1} borderColor="border.default">
              <Box w="full" maxW="720px" mx="auto" px={{ base: 5, md: 8 }} py={{ base: 5, md: 6 }}>
                <ChakraDialog.Title>{title}</ChakraDialog.Title>
                <Stepper currentStep={currentStep} />
              </Box>
            </ChakraDialog.Header>

            <ChakraDialog.Body flex={1} minH={0} overflowY="auto" p={0}>
              <Box w="full" maxW="720px" mx="auto" px={{ base: 5, md: 8 }} py={{ base: 6, md: 8 }}>
                {currentStep === 1 ? (
                  <SetupStep1 defaultValues={step1Data} onNext={handleStep1Next} />
                ) : (
                  <SetupStep2 defaultValues={managerProfileDefaults} onSubmit={handleStep2Submit} />
                )}
              </Box>
            </ChakraDialog.Body>

            <Box flexShrink={0} borderTopWidth={1} borderColor="border.default" bg="white">
              <Flex w="full" maxW="720px" mx="auto" gap={3} justify="flex-end" px={{ base: 5, md: 8 }} py={4}>
                {currentStep === 2 && (
                  <Button variant="outline" onClick={handleBack}>
                    戻る
                  </Button>
                )}
                {currentStep === 1 ? (
                  <Button type="submit" form="setup-step1" colorPalette="teal">
                    次へ
                    <Icon as={LuArrowRight} />
                  </Button>
                ) : (
                  <Button type="submit" form="setup-step2" colorPalette="teal">
                    お店を登録する
                  </Button>
                )}
              </Flex>
            </Box>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
};
