import { useCurrentFrame } from "remotion";
import { Laptop, Phone } from "../components/Devices";
import { CheckBadge, FlyingIcon } from "../components/Icons";
import { NotificationCard } from "../components/NotificationCard";
import { CONFIRM_BUTTON_POINT, ShiftBoardScreen } from "../components/PcScreens";
import { StaffAvatar } from "../components/People";
import { LockScreen } from "../components/PhoneScreens";
import { Cursor } from "../components/Pointer";
import { Scene } from "../components/Scene";
import { Telop } from "../components/Telop";
import { CONFIRMED, STAFF, TELOP } from "../copy";
import { PC_MAIN, PHONE_MAIN, pcPoint } from "../layout";
import { appear, type CameraKey, cameraStyle, EASE, FULL_VIEW, fadeOut, popIn, progress } from "../motion";
import { ASSIGNMENTS, LAST_CELL } from "./S5Build";

const RECEIVERS = [
  { index: 0, x: 1370, y: 470 },
  { index: 1, x: 1640, y: 470 },
  { index: 2, x: 1370, y: 790 },
  { index: 3, x: 1640, y: 790 },
] as const;
const MINI_PHONE_SCALE = 0.36;

const CAMERA: CameraKey[] = [
  { frame: 0, scale: 1.9, x: 1000, y: 470 },
  { frame: 36, scale: 1.9, x: 1000, y: 470 },
  { frame: 60, ...FULL_VIEW },
];

const ConfirmedView = ({ at, compact }: { at: number; compact: boolean }) => {
  const frame = useCurrentFrame();
  return (
    <>
      <LockScreen />
      <div style={{ position: "absolute", left: 14, top: compact ? 56 : 96, ...appear(frame, at) }}>
        <NotificationCard
          title={CONFIRMED.title}
          greeting={CONFIRMED.greeting}
          lines={[CONFIRMED.body, CONFIRMED.yours, ...CONFIRMED.shifts]}
          button={CONFIRMED.button}
          width={288}
          compact={compact}
        />
      </div>
    </>
  );
};

/** S6 ③ 確定すると、スタッフに届く（6秒） */
export const S6Confirm = () => {
  const frame = useCurrentFrame();
  const button = pcPoint(CONFIRM_BUTTON_POINT);
  const click = { x: button.x + 100, y: button.y + 10 };
  const bigPhoneIn = progress(frame, 100, 24, EASE.move);
  const everything = fadeOut(frame, 168, 10);
  return (
    <Scene>
      <div style={{ ...cameraStyle(frame, CAMERA), opacity: everything }}>
        <Laptop {...PC_MAIN}>
          <ShiftBoardScreen assigned={ASSIGNMENTS.map((item) => ({ ...item, at: -100 }))} pressedAt={28} />
        </Laptop>
        <div style={{ position: "absolute", inset: 0, opacity: 1 - 0.75 * progress(frame, 100, 16, EASE.move) }}>
          {RECEIVERS.map(({ index, x, y }, order) => (
            <div
              key={index}
              style={{
                position: "absolute",
                inset: 0,
                ...popIn(frame, 40 + order * 4, 14),
                transformOrigin: `${x}px ${y}px`,
              }}
            >
              <Phone x={x - 61} y={y - 126} scale={MINI_PHONE_SCALE}>
                <ConfirmedView at={70 + order * 4} compact />
              </Phone>
              <StaffAvatar
                staff={STAFF[index]}
                size={96}
                style={{ position: "absolute", left: x - 130, top: y + 30 }}
              />
              <div style={{ position: "absolute", left: x - 58, top: y + 94, ...popIn(frame, 76 + order * 4, 12) }}>
                <CheckBadge size={34} />
              </div>
            </div>
          ))}
        </div>
        {RECEIVERS.map(({ index, x, y }, order) => (
          <FlyingIcon key={index} from={button} to={{ x, y: y - 80 }} start={50 + order * 5} duration={18} lift={140} />
        ))}
        <Phone
          x={1960 + (PHONE_MAIN.x - 1960) * bigPhoneIn}
          y={PHONE_MAIN.y}
          style={{ opacity: progress(frame, 100, 8, EASE.enter) }}
        >
          <ConfirmedView at={112} compact={false} />
        </Phone>
        <Cursor
          keys={[
            { frame: 0, ...LAST_CELL },
            { frame: 24, ...click },
            { frame: 40, ...click },
          ]}
          clicks={[28]}
          start={-10}
          end={40}
        />
      </div>
      <Telop step={3} text={TELOP.confirm} start={12} end={171} />
    </Scene>
  );
};
