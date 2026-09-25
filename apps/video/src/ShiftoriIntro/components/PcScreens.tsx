import type { ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { DASHBOARD, DEADLINE, PERIOD, RECRUITMENT_FORM, REMINDER_AT, SHIFT_BOARD, STAFF } from "../copy";
import { EASE, type Point, popIn, progress } from "../motion";
import { COLORS } from "../theme";
import { AppBar } from "./Devices";
import { BellIcon, CheckBadge, CheckIcon } from "./Icons";
import { StaffAvatar } from "./People";

// PC画面の内寸は1000×625

type RecruitmentFormProps = { periodAt?: number; deadlineAt?: number; pressedAt?: number };

export const RECRUITMENT_BUTTON_POINT: Point = { x: 794, y: 541 };

const FormRow = ({ label, top, children }: { label: string; top: number; children: ReactNode }) => (
  <div
    style={{
      position: "absolute",
      top,
      left: 56,
      right: 56,
      height: 84,
      display: "flex",
      alignItems: "center",
      borderBottom: `2px solid ${COLORS.border}`,
    }}
  >
    <div style={{ width: 230, fontSize: 20, color: COLORS.muted }}>{label}</div>
    {children}
  </div>
);

const valueStyle = { fontSize: 26, fontWeight: 700, color: COLORS.text } as const;

/** シフト募集をつくる画面 */
export const RecruitmentFormScreen = ({ periodAt, deadlineAt, pressedAt }: RecruitmentFormProps) => {
  const frame = useCurrentFrame();
  const pressed = pressedAt !== undefined && frame >= pressedAt && frame < pressedAt + 10;
  const shown = (at?: number) => (at === undefined ? { opacity: 0 } : popIn(frame, at, 12));
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <AppBar />
      <div style={{ position: "absolute", top: 96, left: 56, fontSize: 34, fontWeight: 700, color: COLORS.text }}>
        {RECRUITMENT_FORM.title}
      </div>
      <FormRow label={RECRUITMENT_FORM.period} top={160}>
        <div style={{ ...valueStyle, ...shown(periodAt), transformOrigin: "0% 50%" }}>{PERIOD}</div>
      </FormRow>
      <FormRow label={RECRUITMENT_FORM.deadline} top={244}>
        <div style={{ ...valueStyle, ...shown(deadlineAt), transformOrigin: "0% 50%" }}>{DEADLINE}</div>
      </FormRow>
      <FormRow label={RECRUITMENT_FORM.notice} top={328}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, color: COLORS.text }}>
          <CheckBadge size={30} />
          {RECRUITMENT_FORM.noticeValue}
        </div>
      </FormRow>
      <div
        style={{
          position: "absolute",
          left: RECRUITMENT_BUTTON_POINT.x - 150,
          top: RECRUITMENT_BUTTON_POINT.y - 36,
          width: 300,
          height: 72,
          borderRadius: 16,
          background: pressed ? COLORS.tealDark : COLORS.teal,
          color: COLORS.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 28,
          fontWeight: 700,
        }}
      >
        {RECRUITMENT_FORM.submit}
      </div>
    </div>
  );
};

const GRID = { left: 68, top: 300, width: 864, rowHeight: 140, columns: 5 } as const;

/** ダッシュボードの各スタッフの顔アイコンの中心 */
export const dashboardAvatarPoint = (index: number): Point => {
  const columnWidth = GRID.width / GRID.columns;
  return {
    x: GRID.left + (index % GRID.columns) * columnWidth + columnWidth / 2,
    y: GRID.top + Math.floor(index / GRID.columns) * GRID.rowHeight + 36,
  };
};

type DashboardProps = { submittedAt: Record<string, number>; noticeAt?: number };

/** ダッシュボードの「11月のシフト募集」カード */
export const DashboardScreen = ({ submittedAt, noticeAt }: DashboardProps) => {
  const frame = useCurrentFrame();
  const submitted = STAFF.filter((staff) => {
    const at = submittedAt[staff.id];
    return at !== undefined && frame >= at;
  }).length;
  const ratio = STAFF.reduce((sum, staff) => {
    const at = submittedAt[staff.id];
    return at === undefined ? sum : sum + progress(frame, at, 12, EASE.move);
  }, 0);
  const flip = noticeAt === undefined ? 0 : progress(frame, noticeAt, 10, EASE.enter);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <AppBar />
      <div
        style={{
          position: "absolute",
          left: 40,
          top: 88,
          width: 920,
          height: 510,
          borderRadius: 20,
          border: `2px solid ${COLORS.border}`,
        }}
      />
      <div style={{ position: "absolute", left: 68, top: 112, fontSize: 28, fontWeight: 700, color: COLORS.text }}>
        {DASHBOARD.title}
      </div>
      <div style={{ position: "absolute", left: 68, top: 156, fontSize: 18, color: COLORS.muted }}>
        {DASHBOARD.deadline}
      </div>
      <div
        style={{
          position: "absolute",
          left: 560,
          top: 108,
          width: 372,
          height: 76,
          borderRadius: 14,
          background: COLORS.mintSoft,
          border: `2px solid ${COLORS.mint}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 16px",
          boxSizing: "border-box",
          opacity: flip,
          transform: `perspective(600px) rotateX(${(1 - flip) * 90}deg)`,
          transformOrigin: "50% 0%",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: COLORS.teal,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <BellIcon size={24} />
        </div>
        <div>
          <div style={{ fontSize: 14, color: COLORS.muted }}>{DASHBOARD.autoNotice}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text }}>{REMINDER_AT}</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 68, top: 200, fontSize: 36, fontWeight: 700, color: COLORS.tealDark }}>
        {DASHBOARD.progress(submitted)}
      </div>
      <div
        style={{
          position: "absolute",
          left: 68,
          top: 258,
          width: 864,
          height: 12,
          borderRadius: 6,
          background: COLORS.surface,
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${ratio * 10}%`, height: "100%", borderRadius: 6, background: COLORS.teal }} />
      </div>
      {STAFF.map((staff, index) => {
        const point = dashboardAvatarPoint(index);
        const at = submittedAt[staff.id];
        const done = at !== undefined && frame >= at;
        return (
          <div key={staff.id}>
            <StaffAvatar
              staff={staff}
              size={60}
              style={{ position: "absolute", left: point.x - 30, top: point.y - 30 }}
            />
            {done ? (
              <div style={{ position: "absolute", left: point.x + 14, top: point.y + 8, ...popIn(frame, at, 12) }}>
                <CheckBadge size={28} />
              </div>
            ) : null}
            <div
              style={{
                position: "absolute",
                left: point.x - 86,
                width: 172,
                top: point.y + 38,
                textAlign: "center",
                fontSize: 17,
                color: COLORS.text,
              }}
            >
              {staff.name}
            </div>
            {done ? null : (
              <div
                style={{
                  position: "absolute",
                  left: point.x - 34,
                  width: 68,
                  top: point.y + 66,
                  textAlign: "center",
                  fontSize: 13,
                  color: COLORS.muted,
                  border: `1.5px solid ${COLORS.border}`,
                  borderRadius: 999,
                  padding: "1px 0",
                }}
              >
                {DASHBOARD.notSubmitted}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const BOARD = { left: 242, top: 190, nameLeft: 32, columnWidth: 103.7, rowHeight: 76, headerTop: 150 } as const;

// 行はSTAFFの先頭5人。値は希望の時間帯
const HOPES: Record<number, Record<number, string>> = {
  0: { 1: "17-22", 2: "17-22", 5: "17-22" },
  1: { 0: "10-15", 3: "10-15", 4: "17-22" },
  2: { 1: "10-15", 4: "10-15", 6: "10-15" },
  3: { 2: "17-22", 5: "10-15", 6: "17-22" },
  4: { 0: "17-22", 1: "17-22", 3: "17-22" },
};

export const shiftCellPoint = (row: number, column: number): Point => ({
  x: BOARD.left + column * BOARD.columnWidth + BOARD.columnWidth / 2,
  y: BOARD.top + row * BOARD.rowHeight + BOARD.rowHeight / 2,
});

export const CONFIRM_BUTTON_POINT: Point = { x: 818, y: 102 };

type ShiftBoardProps = { assigned?: { row: number; column: number; at: number }[]; pressedAt?: number };

/** シフト表。淡いミントが希望、ティールが割り当てた勤務 */
export const ShiftBoardScreen = ({ assigned = [], pressedAt }: ShiftBoardProps) => {
  const frame = useCurrentFrame();
  const pressed = pressedAt !== undefined && frame >= pressedAt && frame < pressedAt + 10;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <AppBar />
      <div style={{ position: "absolute", left: 32, top: 84, fontSize: 22, fontWeight: 700, color: COLORS.text }}>
        {SHIFT_BOARD.title}
      </div>
      <div
        style={{
          position: "absolute",
          left: CONFIRM_BUTTON_POINT.x - 150,
          top: CONFIRM_BUTTON_POINT.y - 26,
          width: 300,
          height: 52,
          borderRadius: 14,
          background: pressed ? COLORS.tealDark : COLORS.teal,
          color: COLORS.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 21,
          fontWeight: 700,
        }}
      >
        {SHIFT_BOARD.confirm}
      </div>
      {SHIFT_BOARD.days.map((day, column) => (
        <div
          key={day}
          style={{
            position: "absolute",
            top: BOARD.headerTop,
            left: BOARD.left + column * BOARD.columnWidth,
            width: BOARD.columnWidth,
            textAlign: "center",
            fontSize: 16,
            color: COLORS.muted,
          }}
        >
          {day}
        </div>
      ))}
      {STAFF.slice(0, 5).map((staff, row) => (
        <div key={staff.id}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: BOARD.top + row * BOARD.rowHeight,
              height: BOARD.rowHeight,
              borderTop: `1.5px solid ${COLORS.border}`,
            }}
          />
          <StaffAvatar
            staff={staff}
            size={44}
            style={{ position: "absolute", left: BOARD.nameLeft, top: BOARD.top + row * BOARD.rowHeight + 16 }}
          />
          <div
            style={{
              position: "absolute",
              left: BOARD.nameLeft + 56,
              top: BOARD.top + row * BOARD.rowHeight + 26,
              fontSize: 18,
              color: COLORS.text,
            }}
          >
            {staff.name}
          </div>
          {Object.entries(HOPES[row] ?? {}).map(([columnKey, hope]) => {
            const column = Number(columnKey);
            const point = shiftCellPoint(row, column);
            const assignment = assigned.find((item) => item.row === row && item.column === column);
            const fill = assignment ? progress(frame, assignment.at, 8, EASE.move) : 0;
            return (
              <div
                key={columnKey}
                style={{
                  position: "absolute",
                  left: point.x - 44,
                  top: point.y - 22,
                  width: 88,
                  height: 44,
                  borderRadius: 10,
                  overflow: "hidden",
                  background: COLORS.mint,
                  ...(assignment && frame >= assignment.at ? popIn(frame, assignment.at, 10) : {}),
                }}
              >
                <div style={{ position: "absolute", inset: 0, width: `${fill * 100}%`, background: COLORS.teal }} />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    fontSize: 17,
                    fontWeight: 700,
                    color: fill > 0.5 ? COLORS.background : COLORS.tealDark,
                  }}
                >
                  {fill > 0.5 ? <CheckIcon size={16} /> : null}
                  {hope}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
