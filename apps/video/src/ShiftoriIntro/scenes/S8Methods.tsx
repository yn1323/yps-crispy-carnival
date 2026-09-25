import { Img, staticFile, useCurrentFrame } from "remotion";
import { PHONE, Phone } from "../components/Devices";
import { calendarDayPoint, DateSelectScreen, PatternSelectScreen, TimeSelectScreen } from "../components/PhoneScreens";
import { TapMark } from "../components/Pointer";
import { Scene } from "../components/Scene";
import { Telop } from "../components/Telop";
import { METHOD_LABELS, TELOP } from "../copy";
import { phonePoint } from "../layout";
import { appear, EASE, fadeOut, progress } from "../motion";
import { COLORS } from "../theme";

// store-types-row.png のうち、5つの店先が描かれている帯
const STORE_BAND = { x: 23, y: 388, width: 1498, height: 256, sheetWidth: 1536, sheetHeight: 1024 } as const;
const BAND_VIEW = { x: 140, y: 470, width: 1640 } as const;
const bandScale = BAND_VIEW.width / STORE_BAND.width;

const PHONE_SCALE = 0.84;
const PHONE_TOP = 390;
const phoneAt = (centerX: number) => ({
  x: centerX - (PHONE.width * PHONE_SCALE) / 2,
  y: PHONE_TOP,
  scale: PHONE_SCALE,
});
const PHONES = [phoneAt(480), phoneAt(960), phoneAt(1440)] as const;

const DATE_TAPS = [
  { day: 2, at: 110 },
  { day: 3, at: 122 },
  { day: 6, at: 134 },
] as const;

/** S8 お店に合う集め方を選べる（7秒） */
export const S8Methods = () => {
  const frame = useCurrentFrame();
  const reveal = progress(frame, 6, 24, EASE.move);
  const bandOut = progress(frame, 62, 14, EASE.exit);
  const leave = fadeOut(frame, 192, 14);
  return (
    <Scene>
      <div
        style={{
          position: "absolute",
          left: BAND_VIEW.x,
          top: BAND_VIEW.y,
          width: BAND_VIEW.width,
          height: STORE_BAND.height * bandScale,
          overflow: "hidden",
          clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`,
          opacity: 1 - bandOut,
          translate: `0px ${bandOut * 60}px`,
        }}
      >
        <Img
          src={staticFile("illustrations/store-types-row.png")}
          alt=""
          style={{
            position: "absolute",
            left: -STORE_BAND.x * bandScale,
            top: -STORE_BAND.y * bandScale,
            width: STORE_BAND.sheetWidth * bandScale,
            height: STORE_BAND.sheetHeight * bandScale,
            maxWidth: "none",
          }}
        />
      </div>
      <div style={{ position: "absolute", inset: 0, opacity: leave }}>
        {PHONES.map((device, index) => {
          const shown = progress(frame, 70 + index * 8, 16, EASE.enter);
          return (
            <Phone
              key={METHOD_LABELS[index]}
              {...device}
              style={{ opacity: shown, translate: `0px ${(1 - shown) * 60}px` }}
            >
              {index === 0 ? <TimeSelectScreen switchAt={[110, 160]} /> : null}
              {index === 1 ? <DateSelectScreen selected={[...DATE_TAPS]} /> : null}
              {index === 2 ? (
                <PatternSelectScreen
                  selectAt={[
                    { index: 0, at: 120 },
                    { index: 1, at: 155 },
                  ]}
                />
              ) : null}
            </Phone>
          );
        })}
        {METHOD_LABELS.map((label, index) => (
          <div
            key={label}
            style={{
              position: "absolute",
              left: PHONES[index].x + (PHONE.width * PHONE_SCALE) / 2 - 240,
              width: 480,
              top: 282,
              textAlign: "center",
              fontSize: 72,
              fontWeight: 700,
              color: COLORS.tealDark,
              ...appear(frame, 90 + index * 5),
            }}
          >
            {label}
          </div>
        ))}
        <TapMark point={phonePoint({ x: 236, y: 253 }, PHONES[0])} at={110} size={48} />
        <TapMark point={phonePoint({ x: 236, y: 253 }, PHONES[0])} at={160} size={48} />
        {DATE_TAPS.map(({ day, at }) => (
          <TapMark key={day} point={phonePoint(calendarDayPoint(day), PHONES[1])} at={at} size={48} />
        ))}
        <TapMark point={phonePoint({ x: 158, y: 312 }, PHONES[2])} at={120} size={56} />
        <TapMark point={phonePoint({ x: 158, y: 408 }, PHONES[2])} at={155} size={56} />
      </div>
      <Telop text={TELOP.methods} start={0} end={200} />
    </Scene>
  );
};
