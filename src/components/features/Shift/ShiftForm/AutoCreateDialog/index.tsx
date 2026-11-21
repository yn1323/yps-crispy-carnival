import { Badge, Link, RadioCard, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogActionArea } from "@/src/components/ui/Dialog";

export type AutoCreateMethod = "rule" | "ai";

type AutoCreateDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  /** AIで作れる残りの回数。分からない間は省略し、回数に制限があることだけを伝える。 */
  aiRemainingCount?: number;
  /** AIを使うときの個人情報の扱いを説明するヘルプのURL。ヘルプができるまでは省略する。 */
  aiPrivacyHelpHref?: string;
  /** 「作成する」を押したときに呼ぶ。作成の処理はまだないため、省略した場合は閉じるだけにする。 */
  onCreate?: (method: AutoCreateMethod) => void;
};

const describeAiLimit = (remaining: number | undefined) =>
  remaining === undefined ? "回数制限あり" : `残り${Math.max(remaining, 0)}回`;

/** 募集期間の勤務を自動で作る前に、ルールで作るかAIで作るかを選ぶ。 */
export const AutoCreateDialog = ({
  isOpen,
  onClose,
  aiRemainingCount,
  aiPrivacyHelpHref,
  onCreate,
}: AutoCreateDialogProps) => {
  const [method, setMethod] = useState<AutoCreateMethod>("rule");
  const isAiExhausted = aiRemainingCount !== undefined && aiRemainingCount <= 0;
  // 次に開いたときは、回数を使わない「ルールで作る」から始める。
  const close = () => {
    setMethod("rule");
    onClose();
  };
  const options: { value: AutoCreateMethod; title: string; limit: string; description: string; disabled: boolean }[] = [
    {
      value: "rule",
      title: "希望シフトから自動で作成する",
      limit: "使用制限なし",
      description: "希望、必要人数、過去シフト、メモをもとに自動生成します。",
      disabled: false,
    },
    {
      value: "ai",
      title: "AIで作成する",
      limit: describeAiLimit(aiRemainingCount),
      description: "希望、必要人数、過去シフト、メモをもとにAIで自動生成します。",
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
          この期間のシフトを自動で生成します。
          <br />
          現在の下書きに上書きします。
        </Text>
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
                  {/* 使える回数は、カードの右上に置く。 */}
                  <Badge colorPalette="gray" size="sm" flexShrink={0} ms="auto">
                    {option.limit}
                  </Badge>
                </RadioCard.ItemControl>
              </RadioCard.Item>
            ))}
          </Stack>
        </RadioCard.Root>
        <Text fontSize="xs" lineHeight="tall" color="gray.600">
          ※AI利用時の個人情報の扱いは
          {/* ヘルプができるまではURLがないため、リンクの見た目だけを置く。 */}
          <Link href={aiPrivacyHelpHref} color="teal.700" textDecoration="underline">
            こちら
          </Link>
          をご確認ください。
        </Text>
      </Stack>
    </Dialog>
  );
};
