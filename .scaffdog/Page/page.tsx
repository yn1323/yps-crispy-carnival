import { Animation } from '@/src/components/templates/Animation';

export default function {{ inputs.component | pascal }}Page() {
  return (
    <Animation>
      {{ inputs.component | pascal }}Page
    </Animation>
  );
}
