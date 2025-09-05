import type { Meta, StoryObj } from "@storybook/react";
import { {{ inputs.component | pascal }} } from ".";

const meta = {
  title: '{{ inputs.path }}/{{ inputs.component | pascal }}',
  component: {{ inputs.component | pascal }} ,
  args: {},
  parameters: {},
} satisfies Meta<typeof {{ inputs.component | pascal }} >;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
