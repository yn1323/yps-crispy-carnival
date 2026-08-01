import { LineCallback } from "@/src/components/features/LineCallback";

type Props = {
  code: string | undefined;
  state: string | undefined;
};

export function LineCallbackRoutePage({ code, state }: Props) {
  return <LineCallback code={code} state={state} />;
}
