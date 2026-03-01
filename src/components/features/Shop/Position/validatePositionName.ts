import { POSITION_NAME_MAX_LENGTH } from "@/src/constants/validations";

export const validatePositionName = (name: string, existingNames: string[]): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return "ポジション名を入力してください";
  if (trimmed.length > POSITION_NAME_MAX_LENGTH) return `${POSITION_NAME_MAX_LENGTH}文字以内で入力してください`;
  if (existingNames.some((n) => n === trimmed)) return "このポジション名は既に存在します";
  return null;
};
