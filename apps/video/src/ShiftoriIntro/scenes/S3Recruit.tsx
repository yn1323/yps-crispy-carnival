import { useCurrentFrame } from "remotion";
import { Laptop, Phone } from "../components/Devices";
import { bumpScale, FlyingIcon } from "../components/Icons";
import { NotificationCard } from "../components/NotificationCard";
import { RECRUITMENT_BUTTON_POINT, RecruitmentFormScreen } from "../components/PcScreens";
import { Illustration } from "../components/People";
import {
  calendarDayPoint,
  DateSelectScreen,
  LockScreen,
  SlideSwitch,
  SUBMIT_BUTTON_POINT,
} from "../components/PhoneScreens";
import { Cursor, TapMark } from "../components/Pointer";
import { Scene } from "../components/Scene";
import { Telop } from "../components/Telop";
import { SUBMIT_REQUEST, TELOP } from "../copy";
import { PC_MAIN, PHONE_MAIN, pcPoint, phonePoint } from "../layout";
import { appear, type CameraKey, cameraStyle, EASE, FULL_VIEW, fadeOut, type Point, popIn, progress } from "../motion";

const CARD_BUTTON: Point = { x: 158, y: 407 };
export const SUBMITTED_DAYS = [2, 3, 6, 9, 13] as const;
const DAY_AT = [212, 224, 236, 248, 260] as const;

const CAMERA: CameraKey[] = [
  { frame: 0, ...FULL_VIEW },
  { frame: 4, ...FULL_VIEW },
  { frame: 28, scale: 1.3, x: 680, y: 565 },
  { frame: 80, scale: 1.3, x: 680, y: 565 },
  { frame: 104, ...FULL_VIEW },
  { frame: 132, ...FULL_VIEW },
  { frame: 156, scale: 1.6, x: 1560, y: 622 },
  { frame: 186, scale: 1.6, x: 1560, y: 622 },
  { frame: 200, scale: 1.15, x: 1560, y: 543 },
  { frame: 300, scale: 1.15, x: 1560, y: 543 },
  { frame: 324, ...FULL_VIEW },
];

/** 通知カードが上から下りてきて、fullAtで内容を開く */
const RequestView = ({ dropAt, fullAt }: { dropAt: number; fullAt?: number }) => {
  const frame = useCurrentFrame();
  const drop = progress(frame, dropAt, 12, EASE.enter);
  return (
    <>
      <LockScreen />
      <div
        style={{
          position: "absolute",
          left: 14,
          top: -100 + drop * 156,
          opacity: drop * (fullAt === undefined ? 1 : fadeOut(frame, fullAt - 2, 8)),
        }}
      >
        <NotificationCard title={SUBMIT_REQUEST.title} width={288} compact />
      </div>
      {fullAt === undefined ? null : (
        <div style={{ position: "absolute", left: 14, top: 150, ...appear(frame, fullAt) }}>
          <NotificationCard
            title={SUBMIT_REQUEST.title}
            greeting={SUBMIT_REQUEST.greeting}
            lines={[SUBMIT_REQUEST.body, SUBMIT_REQUEST.deadline]}
            button={SUBMIT_REQUEST.button}
            width={288}
          />
        </div>
      )}
    </>
  );
};

/** S3 ① シフトを募集する → スタッフに届く → 提出（11秒） */
export const S3Recruit = () => {
  const frame = useCurrentFrame();
  const button = pcPoint(RECRUITMENT_BUTTON_POINT);
  // カーソルでボタンの文字を隠さないよう、右寄りを押す
  const click = { x: button.x + 90, y: button.y + 12 };
  return (
    <Scene>
      <div style={cameraStyle(frame, CAMERA)}>
        <Laptop {...PC_MAIN}>
          <RecruitmentFormScreen periodAt={28} deadlineAt={38} pressedAt={76} />
        </Laptop>
        <Phone {...PHONE_MAIN} scale={bumpScale(frame, 116)}>
          <SlideSwitch
            at={180}
            from={<RequestView dropAt={116} fullAt={142} />}
            to={
              <DateSelectScreen
                selected={SUBMITTED_DAYS.map((day, index) => ({ day, at: DAY_AT[index] }))}
                submittedAt={288}
              />
            }
          />
        </Phone>
        <Illustration
          file="saki-phone-happy.png"
          x={990}
          y={560}
          width={420}
          height={420}
          style={{ ...popIn(frame, 296, 15), opacity: Number(popIn(frame, 296, 15).opacity) * fadeOut(frame, 316, 8) }}
        />
        <FlyingIcon from={button} to={phonePoint({ x: 158, y: 80 })} start={92} lift={260} />
        <Cursor
          keys={[
            { frame: 50, x: 1250, y: 1010 },
            { frame: 72, ...click },
            { frame: 96, ...click },
          ]}
          clicks={[76]}
          start={50}
          end={90}
        />
        <TapMark point={phonePoint(CARD_BUTTON)} at={170} />
        {SUBMITTED_DAYS.map((day, index) => (
          <TapMark key={day} point={phonePoint(calendarDayPoint(day))} at={DAY_AT[index]} size={48} />
        ))}
        <TapMark point={phonePoint(SUBMIT_BUTTON_POINT)} at={280} />
      </div>
      <Telop step={1} text={TELOP.recruit} start={0} end={88} />
      <Telop text={TELOP.delivered} start={92} end={196} />
      <Telop text={TELOP.noApp} start={200} end={322} />
    </Scene>
  );
};
