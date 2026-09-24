import type { CSSProperties } from "react";
import { Img, staticFile } from "remotion";
import type { PersonId, Staff } from "../copy";
import { COLORS } from "../theme";

const SHEET = { width: 1672, height: 941 } as const;

// character-sheet.png の中の顔の位置
const CROPS: Record<PersonId, { x: number; y: number; size: number }> = {
  manager: { x: 55, y: 170, size: 300 },
  saki: { x: 400, y: 235, size: 290 },
  haruto: { x: 715, y: 215, size: 290 },
  mio: { x: 1030, y: 225, size: 290 },
  yui: { x: 1355, y: 245, size: 290 },
};

const circle = (size: number): CSSProperties => ({
  position: "relative",
  width: size,
  height: size,
  borderRadius: "50%",
  overflow: "hidden",
  flexShrink: 0,
  border: `${Math.max(2, Math.round(size * 0.03))}px solid ${COLORS.border}`,
  boxSizing: "border-box",
});

/** 設定画から切り出した顔アイコン */
export const Avatar = ({ person, size, style }: { person: PersonId; size: number; style?: CSSProperties }) => {
  const crop = CROPS[person];
  const ratio = size / crop.size;
  return (
    <div style={{ ...circle(size), background: COLORS.mintSoft, ...style }}>
      <Img
        src={staticFile("illustrations/character-sheet.png")}
        alt=""
        style={{
          position: "absolute",
          left: -crop.x * ratio,
          top: -crop.y * ratio,
          width: SHEET.width * ratio,
          height: SHEET.height * ratio,
          maxWidth: "none",
        }}
      />
    </div>
  );
};

/** イラストのない人物は線画の人型で表す */
export const OutlineAvatar = ({ size, style }: { size: number; style?: CSSProperties }) => (
  <div
    style={{
      ...circle(size),
      background: COLORS.surface,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center",
      ...style,
    }}
  >
    <svg aria-hidden="true" width={size * 0.78} height={size * 0.78} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="40" r="18" stroke={COLORS.text} strokeWidth="5" />
      <path d="M14 104 C14 76 30 64 50 64 C70 64 86 76 86 104" stroke={COLORS.text} strokeWidth="5" />
    </svg>
  </div>
);

export const StaffAvatar = ({ staff, size, style }: { staff: Staff; size: number; style?: CSSProperties }) =>
  staff.person ? (
    <Avatar person={staff.person} size={size} style={style} />
  ) : (
    <OutlineAvatar size={size} style={style} />
  );

type IllustrationProps = { file: string; x: number; y: number; width: number; height: number; style?: CSSProperties };

/** apps/video/public/illustrations のイラスト（背景透明） */
export const Illustration = ({ file, x, y, width, height, style }: IllustrationProps) => (
  <Img
    src={staticFile(`illustrations/${file}`)}
    alt=""
    style={{ position: "absolute", left: x, top: y, width, height, objectFit: "contain", ...style }}
  />
);
