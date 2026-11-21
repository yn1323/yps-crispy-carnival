import { Box, RadioCard, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogActionArea } from "@/src/components/ui/Dialog";

export type AutoCreateMethod = "rule" | "ai";

type AutoCreateDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  /** 期間に勤務が1つでも入っているか。入っている場合は、作った勤務に置き換わることを伝える。 */
  hasExistingWork: boolean;
  /** AIで作れる残りの回数。分からない間は省略し、上限があることだけを伝える。 */
  aiRemainingCount?: number;
  /** 「作成する」を押したときに呼ぶ。作成の処理はまだないため、省略した場合は閉じるだけにする。 */
  onCreate?: (method: AutoCreateMethod) => void;
};

const describeAiLimit = (remaining: number | undefined) => {
  if (remaining === undefined) return "使える回数に上限があります。";
  if (remaining <= 0) return "今月の回数を使い切りました。";
  return `今月はあと${remaining}回使えます。`;
};

/** 募集期間の勤務を自動で作る前に、ルールで作るかAIで作るかを選ぶ。 */
export const AutoCreateDialog = ({
  isOpen,
  onClose,
  hasExistingWork,
  aiRemainingCount,
  onCreate,
}: AutoCreateDialogProps) => {
  const [method, setMethod] = useState<AutoCreateMethod>("rule");
  const isAiExhausted = aiRemainingCount !== undefined && aiRemainingCount <= 0;
  // 次に開いたときは、回数を使わない「ルールで作る」から始める。
  const close = () => {
    setMethod("rule");
    onClose();
  };
  const options: { value: AutoCreateMethod; title: string; description: string; disabled: boolean }[] = [
    {
      value: "rule",
      title: "ルールで作る",
      description: "希望と必要人数をもとに、決まった手順で作ります。何回でも使えます。",
      disabled: false,
    },
    {
      value: "ai",
      title: "AIで作る",
      description: `希望と必要人数をもとに、AIが作ります。${describeAiLimit(aiRemainingCount)}`,
      disabled: isAiExhausted,
    },
  ];

  return (
    <Dialog
      title="シフトを自動作成"
      isOpen={isOpen}
      onOpenChange={({ open }) => {
        if (!open) close();
      }}
      footer={
        <DialogActionArea
          layout="standard"
          startAction={
            <Button variant="outline" onClick={close}>
              キャンセル
            </Button>
          }
          endAction={
            <Button
              colorPalette="teal"
              onClick={() => {
                onCreate?.(method);
                close();
              }}
            >
              作成する
            </Button>
          }
        />
      }
    >
      <Stack gap={4}>
        <Text fontSize="sm" lineHeight="tall" color="gray.800">
          募集期間のすべての日の勤務を作ります。
        </Text>
        {hasExistingWork && (
          <Box
            role="note"
            px={3}
            py={2}
            borderRadius="md"
            bg="orange.50"
            borderWidth="1px"
            borderColor="orange.200"
            fontSize="sm"
            color="orange.900"
          >
            いま入っている勤務は、作った勤務に置き換わります。
          </Box>
        )}
        <RadioCard.Root
          value={method}
          colorPalette="teal"
          onValueChange={(details) => {
            if (details.value === "rule" || details.value === "ai") setMethod(details.value);
          }}
        >
          <RadioCard.Label srOnly>作り方</RadioCard.Label>
          <Stack gap={3}>
            {options.map((option) => (
              <RadioCard.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                bg="white"
                cursor="pointer"
                _checked={{ bg: "teal.50" }}
                _disabled={{ cursor: "not-allowed", opacity: 0.6 }}
              >
                <RadioCard.ItemHiddenInput />
                <RadioCard.ItemControl alignItems="flex-start" gap={3} p={{ base: 3, md: 4 }}>
                  <RadioCard.ItemIndicator mt={0.5} flexShrink={0} />
                  <RadioCard.ItemContent minW={0} gap={1}>
                    <RadioCard.ItemText fontWeight="semibold" color="gray.900">
                      {option.title}
                    </RadioCard.ItemText>
                    <RadioCard.ItemDescription fontSize="sm" color="gray.700">
                      {option.description}
                    </RadioCard.ItemDescription>
                  </RadioCard.ItemContent>
                </RadioCard.ItemControl>
              </RadioCard.Item>
            ))}
          </Stack>
        </RadioCard.Root>
      </Stack>
    </Dialog>
  );
};
