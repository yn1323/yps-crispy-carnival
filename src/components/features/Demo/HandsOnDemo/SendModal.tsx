import { Badge, Box, Flex, Icon, Image, Text, useBreakpointValue } from "@chakra-ui/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import { LuCalendarCheck, LuCheck, LuMail, LuPlay, LuUsers } from "react-icons/lu";
import { HANDS_ON_SCENE_DURATIONS, type HandsOnScene } from "./flow";
import { LineConfirmScreen, LineRecruitScreen, PHONE_FRAME_SIZE, PhoneFrame } from "./PhoneScreens";
import type { ConfirmRow } from "./progress";
import { StaffSubmitFrame } from "./StaffSubmitFrame";
import { StepCircle, type StepState } from "./StepCircle";
import {
  HANDS_ON_STAFF_SUBMIT_STEPS,
  type HandsOnStaffSubmitProgress,
  type HandsOnStaffSubmitStep,
} from "./staffSubmitEmbed";

export type SendScene = Extract<
  HandsOnScene,
  "sent" | "staffMessage" | "staffAnswer" | "collected" | "confirmSent" | "confirmMessage"
>;

const SEND_SCENES: readonly SendScene[] = [
  "sent",
  "staffMessage",
  "staffAnswer",
  "collected",
  "confirmSent",
  "confirmMessage",
];
export const isSendScene = (scene: HandsOnScene): scene is SendScene =>
  (SEND_SCENES as readonly HandsOnScene[]).includes(scene);

// 送る場面は、シフトリを主語にして書く。
const SEND_TITLES: Partial<Record<SendScene, string>> = {
  sent: "提出依頼を自動で送ります",
  collected: "希望シフトが届きました",
  confirmSent: "確定したシフトを自動で送ります",
};

const PHONE_CAPTIONS: Partial<Record<SendScene, string>> = {
  staffMessage: "スタッフに届いたお知らせ",
  staffAnswer: "スタッフが希望を出します",
  confirmMessage: "スタッフに届いたお知らせ",
};

/** 送る場面の両端。左はシフトリ（ロゴ）、右はスタッフ（背景のないアイコン）。届いた側にチェックを出す。 */
const Endpoint = ({ icon, label, badge }: { icon?: IconType; label: string; badge: boolean }) => (
  <Flex direction="column" align="center" gap={2} w={{ base: "72px", md: "96px" }} flexShrink={0}>
    <Box position="relative">
      <Flex boxSize={{ base: 14, md: 20 }} align="center" justify="center" color="teal.700">
        {icon ? (
          <Icon as={icon} boxSize={{ base: 10, md: 14 }} strokeWidth={1.6} aria-hidden />
        ) : (
          <Image src="/logo192.webp" alt="" boxSize={{ base: 11, md: 14 }} />
        )}
      </Flex>
      {badge && (
        <Flex
          position="absolute"
          right={-1}
          top={-1}
          boxSize={7}
          borderRadius="full"
          bg="green.500"
          color="white"
          align="center"
          justify="center"
          borderWidth="3px"
          borderColor="white"
          style={{ animation: "hodPop .45s ease-out 2.7s both" }}
          aria-hidden
        >
          <Icon as={LuCheck} boxSize={3.5} strokeWidth={3} />
        </Flex>
      )}
    </Box>
    <Text fontSize="sm" fontWeight="bold" color="gray.700">
      {label}
    </Text>
  </Flex>
);

/** 両端のアイコンの中心の、行の下からの高さ。名前、名前との間、アイコンの半分の合計。 */
const ENDPOINT_CENTER_FROM_BOTTOM = { base: 21 + 8 + 28, md: 21 + 8 + 40 } as const;
const FLYING_ICON_SIZE = 40;

/** シフトリとスタッフの間を、お知らせのアイコンが1つ、大きな放物線を描いてゆっくり飛ぶ。 */
const ArcFlight = ({ icon, reverse }: { icon: IconType; reverse: boolean }) => {
  // スマートフォンでも両端のアイコンが枠に収まるよう、飛ぶ距離と高さを縮める。
  const isWide = useBreakpointValue({ base: false, md: true }) ?? true;
  const lane = isWide ? 320 : 150;
  const height = isWide ? 230 : 170;
  // 線は両端のアイコンの中心の高さに置く。アイコンは線の上から飛び立ち、飛ぶ場所の上の近くまで上がる。
  const lineTop = height - (isWide ? ENDPOINT_CENTER_FROM_BOTTOM.md : ENDPOINT_CENTER_FROM_BOTTOM.base);
  const iconTop = lineTop - FLYING_ICON_SIZE / 2;
  const rise = iconTop - 4;
  const travel = lane - FLYING_ICON_SIZE;
  return (
    <Box position="relative" w={`${lane}px`} h={`${height}px`} flexShrink={0} aria-hidden>
      <Box
        position="absolute"
        left={0}
        right={0}
        top={`${lineTop - 1}px`}
        borderTopWidth="2px"
        borderStyle="dashed"
        borderColor="gray.200"
      />
      <Box
        position="absolute"
        left={0}
        top={`${iconTop}px`}
        style={
          {
            "--travel": `${travel}px`,
            "--rise": `${rise}px`,
            animation: `${reverse ? "hodArcXBack" : "hodArcX"} 2.4s linear .3s both`,
          } as CSSProperties
        }
      >
        <Box style={{ animation: "hodArcY 2.4s .3s both" }}>
          {/* 背景を付けず、アイコンだけを飛ばす。中を白で塗り、下の点線が透けないようにする。 */}
          <Flex boxSize={10} color="teal.600" align="center" justify="center">
            <Icon as={icon} boxSize={10} strokeWidth={1.6} fill="white" />
          </Flex>
        </Box>
      </Box>
    </Box>
  );
};

/** 自動で進む場面のラベル。利用者が操作しなくても、次の場面へ進むことを示す。 */
const AUTO_PLAY_LABEL = "自動で再生中";
const AUTO_PLAY_BADGE_HEIGHT = 28;

const AutoPlayBadge = () => (
  <Badge
    colorPalette="teal"
    variant="subtle"
    size="lg"
    minH={`${AUTO_PLAY_BADGE_HEIGHT}px`}
    bg="teal.50"
    color="teal.700"
    borderRadius="full"
    px={3}
    gap={1.5}
    fontWeight="bold"
    flexShrink={0}
  >
    <Icon as={LuPlay} boxSize={3} fill="currentColor" aria-hidden />
    {AUTO_PLAY_LABEL}
  </Badge>
);

/**
 * 枠の下の線。次の場面へ進むまでの時間を、左から伸ばして見せる。
 * スタッフが希望を出す場面は終わる時間が決まっていないため、提出画面の自動操作の進み具合で伸ばす。
 */
const AutoPlayProgress = ({ scene, staffProgress }: { scene: SendScene; staffProgress: number }) => {
  const duration = HANDS_ON_SCENE_DURATIONS[scene];
  const style: CSSProperties =
    scene === "staffAnswer" || duration === undefined
      ? { transform: `scaleX(${staffProgress})`, transition: "transform .6s ease-out" }
      : { animation: `hodProgress ${duration}ms linear both` };
  return (
    <Box position="absolute" left={0} right={0} bottom={0} h="4px" bg="gray.100" aria-hidden>
      <Box key={scene} h="full" bg="teal.600" transformOrigin="left" style={style} />
    </Box>
  );
};

/** スタッフに届いたお知らせの場面に、お知らせの中身を短く添える。 */
const STAFF_MESSAGE_NOTES = [
  "スタッフごとに専用のお知らせが届きます",
  "お知らせには提出期限が入ります",
  "リンクから提出画面へ進みます",
];

/** スタッフが希望を出す場面に、提出画面の自動操作の手順に合わせて添える説明。 */
const STAFF_ANSWER_NOTES: Record<HandsOnStaffSubmitStep, string> = {
  choose: "希望する日と時間を選びます",
  memo: "管理者に伝えたいことはメモに書きます",
  remove: "×で休みに戻します",
  update: "期限までは提出したあとも直せます",
};

/** PCで、スマートフォンの枠の右に置く説明の幅と、枠との間。 */
const NOTES_WIDTH = 300;
const NOTES_GAP = 24;

const PointMark = () => (
  <Flex boxSize={6} borderRadius="full" bg="teal.50" color="teal.600" align="center" justify="center" flexShrink={0}>
    <Icon as={LuCheck} boxSize={3.5} strokeWidth={3} aria-hidden />
  </Flex>
);

/**
 * スマートフォンの枠に添える短い説明。PCは枠の右、スマートフォンは見出しのすぐ下に出す。
 * `current`を渡すと手順として並べ、いまの手順を強く示す。スマートフォンでは、いまの手順だけを1行で出す。
 */
const SceneNotes = ({ items, current }: { items: string[]; current?: number }) => (
  <Flex
    as="ol"
    direction="column"
    gap={{ base: 0.5, md: 3 }}
    listStyleType="none"
    w={{ base: "full", md: `${NOTES_WIDTH}px` }}
    flexShrink={0}
    order={{ base: -1, md: 0 }}
  >
    {items.map((item, index) => {
      const state: StepState | "point" =
        current === undefined ? "point" : index < current ? "done" : index === current ? "current" : "upcoming";
      return (
        <Flex
          as="li"
          key={item}
          align="center"
          justify={{ base: "center", md: "flex-start" }}
          gap={2}
          display={{ base: current !== undefined && state !== "current" ? "none" : "flex", md: "flex" }}
          aria-current={state === "current" ? "step" : undefined}
        >
          <Box display={{ base: state === "point" ? "none" : "block", md: "block" }}>
            {state === "point" ? <PointMark /> : <StepCircle no={index + 1} state={state} />}
          </Box>
          <Text
            fontSize={{ base: "xs", md: "sm" }}
            fontWeight={state === "current" ? "bold" : "medium"}
            color={state === "done" || state === "upcoming" ? "gray.500" : "gray.800"}
          >
            {item}
          </Text>
        </Flex>
      );
    })}
  </Flex>
);

/**
 * モーダルの外の余白、内側の余白、「自動で再生中」のラベル、見出し、それぞれの間の合計（縦と横）。
 * スマートフォンの枠を、残りいっぱいまで大きくする。
 */
const PHONE_RESERVED = {
  height: 16 * 2 + 24 * 2 + AUTO_PLAY_BADGE_HEIGHT + 16 + 28 + 16,
  width: 16 * 2 + 20 * 2,
} as const;
/** 説明を添える場面で、スマートフォンの画面で見出しの下に説明を出すために空ける高さ（説明と、枠との間）。 */
const NOTES_RESERVED_HEIGHT: Partial<Record<SendScene, number>> = {
  staffMessage: 3 * 18 + 2 * 2 + 12,
  staffAnswer: 24 + 12,
};
const MIN_PHONE_SCALE = 0.6;

const usePhoneScale = (area: { current: HTMLElement | null }, scene: SendScene) => {
  const [scale, setScale] = useState(1);
  const isWide = useBreakpointValue({ base: false, md: true }) ?? true;
  const notesHeight = NOTES_RESERVED_HEIGHT[scene];
  useEffect(() => {
    const element = area.current;
    if (!element) return;
    // 説明は、PCでは枠の右、スマートフォンでは枠の上に置くため、その分だけ枠を小さくする。
    const reservedWidth = PHONE_RESERVED.width + (notesHeight !== undefined && isWide ? NOTES_WIDTH + NOTES_GAP : 0);
    const reservedHeight = PHONE_RESERVED.height + (notesHeight !== undefined && !isWide ? notesHeight : 0);
    const update = () => {
      const byHeight = (element.clientHeight - reservedHeight) / PHONE_FRAME_SIZE.height;
      const byWidth = (element.clientWidth - reservedWidth) / PHONE_FRAME_SIZE.width;
      setScale(Math.max(MIN_PHONE_SCALE, Math.min(byHeight, byWidth)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [area, isWide, notesHeight]);
  return scale;
};

type Props = {
  scene: SendScene;
  shopName: string;
  staffName: string;
  periodLabel: string;
  deadlineLabel: string;
  periodStart: string;
  confirmRows: ConfirmRow[];
  onStaffSubmitted: () => void;
};

/**
 * 送る場面とお知らせを、見出しも下のボタンもない中央のモーダルで見せる。決まった時間で次の場面へ進む。
 * 上に「自動で再生中」、下に次の場面までの線を出し、操作しなくても進むことを示す。
 * 読み上げでは、見出しだけを伝える。
 */
export const SendModal = ({
  scene,
  shopName,
  staffName,
  periodLabel,
  deadlineLabel,
  periodStart,
  confirmRows,
  onStaffSubmitted,
}: Props) => {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const scale = usePhoneScale(areaRef, scene);
  const title = SEND_TITLES[scene];
  const caption = PHONE_CAPTIONS[scene];
  const [staffProgress, setStaffProgress] = useState<HandsOnStaffSubmitProgress>({ progress: 0, step: "choose" });

  return (
    <Flex
      ref={areaRef}
      position="absolute"
      inset={0}
      zIndex={20}
      align="center"
      justify="center"
      bg="blackAlpha.500"
      backdropFilter="blur(2px)"
      px={4}
      style={{ animation: "hodSceneIn .3s ease-out both" }}
    >
      <Box
        position="relative"
        overflow="hidden"
        w={caption ? "auto" : "full"}
        maxW={caption ? "none" : "680px"}
        bg="white"
        borderRadius="2xl"
        boxShadow="2xl"
        px={caption ? 5 : { base: 5, md: 10 }}
        py={caption ? 6 : { base: 8, md: 12 }}
      >
        {caption ? (
          <Flex
            key={scene}
            direction="column"
            align="center"
            gap={4}
            style={{ animation: "hodFadeUp .4s ease-out both" }}
          >
            <AutoPlayBadge />
            <Text role="status" fontSize={{ base: "md", md: "lg" }} fontWeight="bold" color="gray.900">
              {caption}
            </Text>
            <Flex direction={{ base: "column", md: "row" }} align="center" gap={{ base: 3, md: `${NOTES_GAP}px` }}>
              <PhoneFrame scale={scale}>
                {scene === "staffMessage" && (
                  <LineRecruitScreen
                    shopName={shopName}
                    staffName={staffName}
                    periodLabel={periodLabel}
                    deadlineLabel={deadlineLabel}
                  />
                )}
                {scene === "staffAnswer" && (
                  <StaffSubmitFrame periodStart={periodStart} onProgress={setStaffProgress} onDone={onStaffSubmitted} />
                )}
                {scene === "confirmMessage" && (
                  <LineConfirmScreen
                    shopName={shopName}
                    staffName={staffName}
                    periodLabel={periodLabel}
                    rows={confirmRows}
                  />
                )}
              </PhoneFrame>
              {scene === "staffMessage" && <SceneNotes items={STAFF_MESSAGE_NOTES} />}
              {scene === "staffAnswer" && (
                <SceneNotes
                  items={HANDS_ON_STAFF_SUBMIT_STEPS.map((step) => STAFF_ANSWER_NOTES[step])}
                  current={HANDS_ON_STAFF_SUBMIT_STEPS.indexOf(staffProgress.step)}
                />
              )}
            </Flex>
          </Flex>
        ) : (
          <Flex direction="column" align="center" gap={4}>
            <AutoPlayBadge />
            <Flex direction="column" align="center" gap={{ base: 6, md: 8 }} w="full">
              {/* 線を両端のアイコンの中心にそろえるため、下にそろえる。 */}
              <Flex align="flex-end" justify="center" gap={{ base: 0, md: 2 }} w="full">
                <Endpoint label="シフトリ" badge={scene === "collected"} />
                <ArcFlight
                  key={scene}
                  reverse={scene === "collected"}
                  icon={scene === "collected" ? LuCalendarCheck : LuMail}
                />
                <Endpoint icon={LuUsers} label="スタッフ" badge={scene === "confirmSent"} />
              </Flex>
              <Text
                key={scene}
                role="status"
                fontSize={{ base: "lg", md: "xl" }}
                fontWeight="bold"
                color="gray.900"
                lineHeight="1.4"
                textAlign="center"
                style={{ animation: "hodFadeUp .45s ease-out both" }}
              >
                {title}
              </Text>
            </Flex>
          </Flex>
        )}
        <AutoPlayProgress scene={scene} staffProgress={staffProgress.progress} />
      </Box>
    </Flex>
  );
};
