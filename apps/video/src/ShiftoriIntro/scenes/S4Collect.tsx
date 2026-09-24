import { useCurrentFrame } from "remotion";
import { Laptop, Phone } from "../components/Devices";
import { CheckBadge, FlyingIcon } from "../components/Icons";
import { NotificationCard } from "../components/NotificationCard";
import { DashboardScreen, dashboardAvatarPoint } from "../components/PcScreens";
import { StaffAvatar } from "../components/People";
import { DateSelectScreen } from "../components/PhoneScreens";
import { Scene } from "../components/Scene";
import { Telop } from "../components/Telop";
import { REMINDER_TITLE, STAFF, TELOP } from "../copy";
import { PC_MAIN, PHONE_MAIN, pcPoint } from "../layout";
import { appear, type CameraKey, cameraStyle, FULL_VIEW, fadeOut, popIn } from "../motion";
import { COLORS } from "../theme";
import { SUBMITTED_DAYS } from "./S3Recruit";

// スタッフ番号はSTAFFの並び順
const ARRIVALS = [
  { index: 6, start: 10 },
  { index: 7, start: 22 },
  { index: 8, start: 34 },
  { index: 9, start: 46 },
] as const;
const ARRIVAL_DURATION = 18;

const SUBMITTED_AT: Record<string, number> = {
  saki: -100,
  mio: -100,
  riko: -100,
  ...Object.fromEntries(ARRIVALS.map(({ index, start }) => [STAFF[index].id, start + ARRIVAL_DURATION])),
};

/** S4の終わりの提出状況。後のシーンで使う */
export const FINAL_SUBMITTED_AT: Record<string, number> = Object.fromEntries(
  Object.keys(SUBMITTED_AT).map((id) => [id, -100]),
);

const UNSUBMITTED = [
  { index: 1, x: 1330 },
  { index: 3, x: 1515 },
  { index: 4, x: 1700 },
] as const;
const SUBMITTED_ROW = [0, 2, 5, 6, 7, 8, 9] as const;

const CAMERA: CameraKey[] = [
  { frame: 0, ...FULL_VIEW },
  { frame: 24, scale: 1.45, x: 680, y: 640 },
  { frame: 80, scale: 1.45, x: 680, y: 640 },
  { frame: 104, ...FULL_VIEW },
];

/** S4 希望シフトが集まる → 未提出の人にだけ（7秒） */
export const S4Collect = () => {
  const frame = useCurrentFrame();
  const groupOpacity = fadeOut(frame, 190, 12);
  return (
    <Scene>
      <div style={cameraStyle(frame, CAMERA)}>
        <Laptop {...PC_MAIN}>
          <DashboardScreen submittedAt={SUBMITTED_AT} noticeAt={90} />
        </Laptop>
        <Phone {...PHONE_MAIN} style={{ opacity: fadeOut(frame, 0, 10) }}>
          <DateSelectScreen selected={SUBMITTED_DAYS.map((day) => ({ day, at: -100 }))} submittedAt={-100} />
        </Phone>
        {ARRIVALS.map(({ index, start }) => (
          <FlyingIcon
            key={index}
            from={{ x: 2000, y: 420 }}
            to={pcPoint(dashboardAvatarPoint(index))}
            start={start}
            duration={ARRIVAL_DURATION}
            lift={120}
          />
        ))}
        <div style={{ position: "absolute", inset: 0, opacity: groupOpacity }}>
          {UNSUBMITTED.map(({ index, x }, order) => (
            <div key={index}>
              <StaffAvatar
                staff={STAFF[index]}
                size={150}
                style={{ position: "absolute", left: x - 75, top: 395, ...popIn(frame, 96 + order * 4, 14) }}
              />
              <div
                style={{
                  position: "absolute",
                  left: x - 90,
                  width: 180,
                  top: 552,
                  textAlign: "center",
                  fontSize: 22,
                  color: COLORS.text,
                  ...appear(frame, 98 + order * 4),
                }}
              >
                {STAFF[index].name}
              </div>
              <div style={{ position: "absolute", left: x - 88, top: 600, ...popIn(frame, 128 + order * 6, 14) }}>
                <NotificationCard title={REMINDER_TITLE} width={176} compact hideShop />
              </div>
              <FlyingIcon
                from={pcPoint(dashboardAvatarPoint(index))}
                to={{ x, y: 470 }}
                start={110 + order * 6}
                duration={18}
                kind="bell"
                lift={120}
              />
            </div>
          ))}
          {SUBMITTED_ROW.map((index, order) => {
            const x = 1515 + (order - 3) * 76;
            return (
              <div
                key={index}
                style={{
                  position: "absolute",
                  left: x - 32,
                  top: 818,
                  opacity: 0.9,
                  ...appear(frame, 104 + order * 2),
                }}
              >
                <StaffAvatar staff={STAFF[index]} size={64} />
                <div style={{ position: "absolute", left: 40, top: 40 }}>
                  <CheckBadge size={26} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Telop text={TELOP.collected} start={4} end={74} />
      <Telop text={TELOP.reminder} start={78} end={200} />
    </Scene>
  );
};
