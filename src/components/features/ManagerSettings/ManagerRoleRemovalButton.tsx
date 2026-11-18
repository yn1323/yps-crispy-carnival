import { Popover, Portal, Text, VisuallyHidden } from "@chakra-ui/react";
import { type PointerEvent, useId, useState } from "react";
import { LuUserMinus } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

type Props = {
  disabledReason?: string;
  onRemoveRole: () => void;
};

/**
 * 管理者権限を外すボタン。
 * 外せない理由は常時表示せず、ホバー、フォーカス、タップで開く吹き出しに出す。
 * `disabled`属性ではタップやフォーカスを受け取れないため、無効状態は`aria-disabled`で表す。
 */
export function ManagerRoleRemovalButton({ disabledReason, onRemoveRole }: Props) {
  const reasonId = useId();
  const [isReasonOpen, setIsReasonOpen] = useState(false);
  const isDisabled = Boolean(disabledReason);
  const setOpenByMouse = (open: boolean) => (event: PointerEvent) => {
    if (!isDisabled || event.pointerType !== "mouse") return;
    // フォーカス中はマウスが離れても理由を出したままにする。
    if (!open && document.activeElement === event.currentTarget) return;
    setIsReasonOpen(open);
  };

  return (
    <Popover.Root
      open={isDisabled && isReasonOpen}
      onOpenChange={({ open }) => setIsReasonOpen(open)}
      positioning={{ placement: "bottom-end", gutter: 6 }}
      autoFocus={false}
      lazyMount
      unmountOnExit
    >
      <Popover.Anchor asChild>
        <Button
          variant="outline"
          colorPalette="red"
          minH={{ base: "44px", md: "36px" }}
          minW={{ base: "44px", md: "auto" }}
          px={{ base: 0, md: 3 }}
          gap={{ base: 0, md: 2 }}
          size={{ base: "md", md: "sm" }}
          flexShrink={0}
          aria-disabled={isDisabled || undefined}
          aria-label="管理者権限を外す"
          aria-describedby={isDisabled ? reasonId : undefined}
          onClick={() => {
            if (isDisabled) setIsReasonOpen(true);
            else onRemoveRole();
          }}
          onPointerEnter={setOpenByMouse(true)}
          onPointerLeave={setOpenByMouse(false)}
          onFocus={() => {
            if (isDisabled) setIsReasonOpen(true);
          }}
          onBlur={() => setIsReasonOpen(false)}
        >
          <LuUserMinus aria-hidden />
          <Text as="span" display={{ base: "none", md: "inline" }}>
            管理者権限を外す
          </Text>
        </Button>
      </Popover.Anchor>
      {isDisabled && <VisuallyHidden id={reasonId}>{disabledReason}</VisuallyHidden>}
      <Portal>
        <Popover.Positioner>
          <Popover.Content
            aria-hidden
            w="max-content"
            maxW="min(280px, calc(100vw - 24px))"
            px={3}
            py={2}
            fontSize="xs"
            color="white"
            css={{ "--popover-bg": "colors.gray.800" }}
          >
            <Popover.Arrow>
              <Popover.ArrowTip />
            </Popover.Arrow>
            {disabledReason}
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
