import { BREAK_POSITION } from "./constants";

type PositionIdentity = {
  positionId: string;
  positionName?: string;
};

// 保存・警告計算ではcanonicalなIDだけを休憩として扱う。
export const isCanonicalBreakPosition = (position: Pick<PositionIdentity, "positionId">): boolean =>
  position.positionId === BREAK_POSITION.id;

// 表示では、ID導入前から残る「休憩」という名前のsegmentも互換的に除外する。
export const isLegacyCompatibleBreakPosition = (position: PositionIdentity): boolean =>
  isCanonicalBreakPosition(position) || position.positionName === BREAK_POSITION.name;

export const isCanonicalWorkPosition = (position: Pick<PositionIdentity, "positionId">): boolean =>
  !isCanonicalBreakPosition(position);

export const isLegacyCompatibleWorkPosition = (position: PositionIdentity): boolean =>
  !isLegacyCompatibleBreakPosition(position);
