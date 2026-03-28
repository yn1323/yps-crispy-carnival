import {
  Box,
  Button,
  Dialog as ChakraDialog,
  Circle,
  Flex,
  HStack,
  Icon,
  Portal,
  Text,
  useBreakpointValue,
} from "@chakra-ui/react";
import { useCallback, useState } from "react";
import { LuArrowRight, LuCheck } from "react-icons/lu";
import type { Step1Data } from "./SetupStep1";
import { SetupStep1 } from "./SetupStep1/index.tsx";
import type { Step2Data } from "./SetupStep2";
import { SetupStep2 } from "./SetupStep2/index.tsx";

export type SetupData = Step1Data & Step2Data;

type Props = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onComplete: (data: SetupData) => void;
};

const INITIAL_STEP1: Step1Data = { shopName: "", shiftStartTime: "", shiftEndTime: "" };

const Stepper = ({ currentStep }: { currentStep: 1 | 2 }) => (
  <HStack width="full" gap={0} py={3}>
    <HStack gap={2} flexShrink={0}>
      <Circle size={7} bg="teal.solid" color="white" fontSize="xs" fontWeight="semibold">
        {currentStep > 1 ? <Icon as={LuCheck} boxSize={4} /> : "1"}
      </Circle>
      <Text fontSize="sm" fontWeight="semibold" color="teal.solid">
        店舗情報
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
        あなたの情報
      </Text>
    </HStack>
  </HStack>
);

export const SetupModal = ({ isOpen, onOpenChange, onComplete }: Props) => {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [step1Data, setStep1Data] = useState<Step1Data>(INITIAL_STEP1);
  const isMobile = useBreakpointValue({ base: true, lg: false });

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

  const title = currentStep === 1 ? "店舗情報を登録" : "あなたの情報を登録";
  const placement = isMobile ? "bottom" : "center";

  return (
    <ChakraDialog.Root
      open={isOpen}
      onOpenChange={handleOpenChange}
      placement={placement}
      modal={!isMobile}
      closeOnInteractOutside={false}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content
            borderTopRadius="xl"
            borderBottomRadius={isMobile ? 0 : "xl"}
            maxH={isMobile ? "85vh" : undefined}
            w={isMobile ? "100%" : undefined}
            maxW={isMobile ? undefined : "480px"}
            display="flex"
            flexDirection="column"
          >
            <ChakraDialog.Header flexShrink={0} pb={0} flexDirection="column" alignItems="stretch">
              <ChakraDialog.Title>{title}</ChakraDialog.Title>
              <Stepper currentStep={currentStep} />
            </ChakraDialog.Header>

            <ChakraDialog.Body>
              {currentStep === 1 ? (
                <SetupStep1 defaultValues={step1Data} onNext={handleStep1Next} />
              ) : (
                <SetupStep2 onSubmit={handleStep2Submit} />
              )}
            </ChakraDialog.Body>

            <Flex gap={3} justify="flex-end" px={6} py={4} borderTop="1px solid" borderColor="gray.200" flexShrink={0}>
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
                  登録する
                </Button>
              )}
            </Flex>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
};
