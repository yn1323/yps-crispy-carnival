// @vitest-environment jsdom

import { ChakraProvider } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { system } from "@/src/configs/theme";
import { Select } from "../Select";
import { Input, NativeSelect, Textarea } from ".";

const authAutoCompleteValues = ["email", "current-password", "new-password", "one-time-code"] as const;

describe("FormControls autocomplete policy", () => {
  it("通常の入力欄はすべてautocompleteをoffにする", () => {
    const { container } = render(
      <ChakraProvider value={system}>
        <Input aria-label="通常の入力" />
        <Textarea aria-label="通常の自由入力" />
        <NativeSelect.Root>
          <NativeSelect.Field aria-label="通常の選択">
            <option value="one">選択肢</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Select items={[{ value: "one", label: "選択肢" }]} value="one" onChange={() => {}} usePortal={false} />
      </ChakraProvider>,
    );

    const formControls = container.querySelectorAll("input, textarea, select");
    expect(formControls).toHaveLength(4);

    for (const control of formControls) {
      expect(control.getAttribute("autocomplete")).toBe("off");
    }
  });

  it("認証入力だけ用途別のautocompleteを許可する", () => {
    render(
      <ChakraProvider value={system}>
        {authAutoCompleteValues.map((autoComplete) => (
          <Input key={autoComplete} aria-label={autoComplete} autocompletePolicy="auth" autoComplete={autoComplete} />
        ))}
      </ChakraProvider>,
    );

    for (const autoComplete of authAutoCompleteValues) {
      expect(screen.getByLabelText(autoComplete).getAttribute("autocomplete")).toBe(autoComplete);
    }
  });
});
