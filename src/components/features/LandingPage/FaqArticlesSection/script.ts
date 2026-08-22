export function splitLandingFaqAnswerSentences(answer: string): string[] {
  return (answer.match(/[^。]+。|[^。]+$/g) ?? []).map((sentence) => sentence.trim()).filter(Boolean);
}
