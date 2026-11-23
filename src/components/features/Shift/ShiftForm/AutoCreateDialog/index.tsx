import { Badge, Box, Checkbox, Link, Stack, Text } from "@chakra-ui/react";
import { useId, useState } from "react";
import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogActionArea } from "@/src/components/ui/Dialog";
import {
  readAutoCreateIncludesBreaks,
  readAutoCreateUsesAi,
  storeAutoCreateIncludesBreaks,
  storeAutoCreateUsesAi,
} from "../autoCreateOptionStorage";

/** "rule"は希望シフトから決まった手順で作る。"ai"は、そのあとでAIがメモを読んで手直しする。 */
export type AutoCreateMethod = "rule" | "ai";
export type AutoCreateOptions = {
  /** 休憩時間も作るか。選択を出さない募集方式では、trueのまま渡す。 */
  includesBreaks: boolean;
};

type AutoCreateDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  /**
   * この募集でAIを使える残りの回数。3回以下になったら回数を出し、0なら、AIの手直しを選べなくする。
   * 分からない間は省略し、回数に制限があることだけを伝える。
   */
  aiRemainingCount?: number;
  /** AIを使うときの個人情報の扱いを説明するヘルプのURL。ヘルプができるまでは省略する。 */
  aiPrivacyHelpHref?: string;
  /**
   * 「作成する」を押したときに呼ぶ。終わるまで待ってから閉じる。省略した場合は閉じるだけにする。
   * falseを返した場合は閉じない。作れなかったあとで、AIの手直しを外して作り直せるようにするためである。
   */
  onCreate?: (method: AutoCreateMethod, options: AutoCreateOptions) => boolean | Promise<boolean>;
  /** AIを使えない理由。渡した場合は、AIの手直しを選べなくし、理由を説明に出す。 */
  aiUnavailableReason?: AiUnavailableReason;
  /** 「休憩時間も自動作成する」の選択を出すか。休憩を扱う時間指定の募集でだけ出す。 */
  showsBreakOption?: boolean;
  /** 作成中かどうか。作成中は「作成する」に進行を出し、閉じる操作を止める。 */
  isCreating?: boolean;
  /** 募集期間に、必要人数のある日が1日もない。「作成する」を押せなくし、必要人数の設定を案内する。 */
  isRequirementMissing?: boolean;
  /** 「必要人数設定」を開く。省略した場合は、案内の文だけを出す。 */
  onOpenSetup?: () => void;
};

/** "notConfigured"はAIを使えない環境、"unsupported"は時間指定でない募集。 */
export type AiUnavailableReason = "notConfigured" | "unsupported";

/** 残りの回数を出し始める回数。これより多く残っている間は、回数に制限があることだけを伝える。 */
const AI_REMAINING_NOTICE_COUNT = 3;

const describeAiLimit = (remaining: number | undefined) =>
  remaining === undefined || remaining > AI_REMAINING_NOTICE_COUNT
    ? "回数制限あり"
    : `回数制限あり：あと${Math.max(remaining, 0)}回`;

/** チェックボックスの幅（20px）と、ラベルとの間（10px）。使えない理由と回数を、ラベルと左でそろえるために下げる。 */
const AI_TEXT_INDENT = "30px";
const AI_OPTION_LABEL = "メモの内容に合わせてAIで手直しする";
const AI_UNAVAILABLE_DESCRIPTIONS: Record<AiUnavailableReason, string> = {
  notConfigured: "現在は利用できません。",
  unsupported: "時間指定の募集で使えます。",
};

/** 募集期間の勤務を自動で作る前に、休憩も作るかと、AIでメモに合わせて手直しするかを選ぶ。 */
export const AutoCreateDialog = ({
  isOpen,
  onClose,
  aiRemainingCount,
  aiPrivacyHelpHref,
  onCreate,
  showsBreakOption = false,
  isCreating = false,
  isRequirementMissing = false,
  onOpenSetup,
  aiUnavailableReason,
}: AutoCreateDialogProps) => {
  // どちらの選択も、端末に覚えた状態から始める。閉じても戻さない。
  const [includesBreaks, setIncludesBreaks] = useState(readAutoCreateIncludesBreaks);
  const [usesAi, setUsesAi] = useState(readAutoCreateUsesAi);
  const aiDescriptionId = useId();
  const isAiExhausted = aiRemainingCount !== undefined && aiRemainingCount <= 0;
  const isAiDisabled = isAiExhausted || aiUnavailableReason !== undefined;
  // 使えない間は外した状態で見せる。覚えた選択は変えず、使えるようになったら元の状態に戻す。
  const isAiChecked = usesAi && !isAiDisabled;
  const aiLimit = aiUnavailableReason === "notConfigured" ? "準備中" : describeAiLimit(aiRemainingCount);
  // 説明は、使えない理由があるときだけ出す。
  const aiDescription = aiUnavailableReason ? AI_UNAVAILABLE_DESCRIPTIONS[aiUnavailableReason] : undefined;

  return (
    <Dialog
      title="シフトを自動作成"
      isOpen={isOpen}
      preventClose={isCreating}
      onOpenChange={({ open }) => {
        if (!open && !isCreating) onClose();
      }}
      footer={
        <DialogActionArea
          layout="standard"
          startAction={
            <Button variant="outline" disabled={isCreating} onClick={onClose}>
              キャンセル
            </Button>
          }
          endAction={
            <Button
              colorPalette="teal"
              loading={isCreating}
              disabled={isRequirementMissing}
              onClick={async () => {
                const isDone = await onCreate?.(isAiChecked ? "ai" : "rule", { includesBreaks });
                if (isDone !== false) onClose();
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
          希望、必要人数、過去シフトをもとに、シフトを自動で生成します。
          <br />
          現在の下書きに上書きします。
        </Text>
        <Stack
          role="group"
          aria-label="オプション"
          gap={3}
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="md"
          p={{ base: 3, md: 4 }}
        >
          {showsBreakOption && (
            <Checkbox.Root
              colorPalette="teal"
              checked={includesBreaks}
              disabled={isCreating}
              onCheckedChange={(details) => {
                const next = details.checked === true;
                setIncludesBreaks(next);
                storeAutoCreateIncludesBreaks(next);
              }}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <Checkbox.Label fontSize="sm" color="gray.800">
                休憩時間も自動作成する
              </Checkbox.Label>
            </Checkbox.Root>
          )}
          <Box>
            {/* 使える回数は、PCでは行の右に、スマートフォンではラベルの下に置く。 */}
            <Stack
              direction={{ base: "column", md: "row" }}
              align="flex-start"
              justify="space-between"
              gap={{ base: 1, md: 3 }}
            >
              <Checkbox.Root
                colorPalette="teal"
                checked={isAiChecked}
                disabled={isCreating || isAiDisabled}
                alignItems="flex-start"
                minW={0}
                onCheckedChange={(details) => {
                  const next = details.checked === true;
                  setUsesAi(next);
                  storeAutoCreateUsesAi(next);
                }}
              >
                <Checkbox.HiddenInput aria-describedby={aiDescription ? aiDescriptionId : undefined} />
                <Checkbox.Control mt={0.5} />
                <Checkbox.Label fontSize="sm" color="gray.800">
                  {AI_OPTION_LABEL}
                </Checkbox.Label>
              </Checkbox.Root>
              <Badge colorPalette="gray" size="sm" flexShrink={0} ms={{ base: AI_TEXT_INDENT, md: 0 }}>
                {aiLimit}
              </Badge>
            </Stack>
            {aiDescription && (
              <Text id={aiDescriptionId} fontSize="xs" lineHeight="tall" color="gray.600" ps={AI_TEXT_INDENT} mt={1}>
                {aiDescription}
              </Text>
            )}
          </Box>
        </Stack>
        {isRequirementMissing && (
          <Box borderWidth="1px" borderColor="orange.200" bg="orange.50" borderRadius="md" px={3} py={2.5}>
            <Text fontSize="sm" lineHeight="tall" color="gray.800">
              自動作成には必要人数の設定が必要です
            </Text>
            {onOpenSetup && (
              <Button variant="plain" size="sm" h="auto" p={0} mt={1} color="teal.700" onClick={onOpenSetup}>
                必要人数設定を開く
              </Button>
            )}
          </Box>
        )}
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
