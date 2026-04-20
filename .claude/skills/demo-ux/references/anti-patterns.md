# Demo UX Anti-patterns

Organized as **symptom → cause → fix**. Use this file when reviewing an existing demo for problems.

## Step count bloat

**Symptom**: Tour has 7+ steps, each explaining a feature before the user tries it.
**Cause**: Designer assumed "more explanation = better understanding." In practice, front-loaded explanation doesn't stick and users bail.
**Fix**: Cut to 3 action steps. Move remaining explanations to contextual tooltips that fire when the user is about to use the feature. Treat the 3-step 72% completion benchmark as a hard ceiling.

## Auto-start modal on page load

**Symptom**: Landing on `/demo` immediately pops a modal that covers the product.
**Cause**: "Immediate engagement" interpretation that ignores user autonomy.
**Fix**: Render the sandbox first. Add a non-blocking inline CTA ("Start the 30-second tour →") in a dismissible banner or card. User-initiated completion is 2–3× higher.

## Click-Next progression on action steps

**Symptom**: Tooltip says "Try dragging this bar" but has a "Next" button the user can click to advance without ever dragging.
**Cause**: Default implementation in most tour libraries. Easier to build than event-driven.
**Fix**: Listen for the actual event (drag-end, click, submit). Advance the tour only when the user performs the action. Disable or hide "Next" on action steps.

## Empty initial state

**Symptom**: Demo opens to "Click + to add your first item" with nothing else on screen.
**Cause**: Developer-brain: fresh-account experience == demo experience.
**Fix**: Seed the demo with realistic, pre-broken content. The user should walk in and see a *problem they can fix*, not a blank canvas they need to populate.

## Hidden skip / force-march tours

**Symptom**: No visible skip control; user can only X out of the modal or close the browser tab.
**Cause**: "Don't let them leave the tour" reasoning.
**Fix**: Every step has a visible "Skip" / "自由に触る" control, adjacent to the step counter. Skipping preserves the sandbox state. B2B tour completion averages ~5% — designing for skip is designing for reality.

## Skip resets the sandbox

**Symptom**: User skips mid-tour, everything they did is wiped to initial state.
**Cause**: Conflation of "skip tour" with "reset demo".
**Fix**: These are two different operations. Skip leaves state alone. Reset (a separate button in page chrome) wipes state. Never collapse them into one.

## Hard reset confirmation

**Symptom**: "Reset demo" button opens a modal asking the user to type "RESET" to confirm.
**Cause**: Over-application of production-data safety patterns.
**Fix**: Single-sentence confirmation ("デモの操作内容がクリアされます。よろしいですか？") with a plain Yes button. This is a sandbox — reload already resets.

## Narrative tooltip copy

**Symptom**: Tooltips read like marketing copy: "Welcome to the future of scheduling! Our revolutionary approach lets you…"
**Cause**: Copy written by a marketer or written before the rest of the tour was designed.
**Fix**: Verb-first, instructional, ≤30 words, points at the next action. "Drag the bar to change 高橋さん's end time to 16:00."

## Feature-label tooltip copy

**Symptom**: Tooltip title says "Shift Editor" and body says "This is the shift editor."
**Cause**: Writer explained *what it is*, not *what to do with it*.
**Fix**: Rewrite as an action prompt. Title: "Edit a shift." Body: "Drag the bar to change the time."

## 擬音語・抽象語の多用 (JP)

**Symptom**: 「ぱっと伝わります」「さらっと見られます」のような曖昧な表現。
**Cause**: 雰囲気の良い日本語を書こうとして具体性を失う。
**Fix**: 具体的な動作・数字に置き換える。「スタッフ全員にメール送信されます」「30秒で要点が見られます」。

## 体言止めを本文で多用 (JP)

**Symptom**: 本文が「シフトの編集。バーをドラッグで時間変更。」のように体言止めの連続。
**Cause**: タイトル向けの指針を本文にも適用した。
**Fix**: 本文は「バーをドラッグして時間を変えられます。」のように述語で終わる文に。体言止めはタイトル・見出しだけ。

## Full-screen celebration modal at end

**Symptom**: Last tour step fills the screen with "🎉 Tour complete! You've mastered the basics!"
**Cause**: Over-ceremony; trying to manufacture a "moment".
**Fix**: Replace with an inline tooltip + 1–2 CTAs on the same spot where the last action happened. Less ceremony, more momentum. Inline CTA outperforms celebration modal for SMB flows.

## Single end-of-tour CTA

**Symptom**: Last step shows only "Sign up now."
**Cause**: Funnel focus without thinking about lower-intent users.
**Fix**: Two CTAs — low-commitment + high-commitment. "Keep exploring" next to "Start free." Capture users at whatever intent level they arrive at.

## No mid-tour exit to CTA

**Symptom**: User hits aha at step 2, wants to sign up, has to finish the tour or skip first.
**Cause**: Tour flow is a sealed box.
**Fix**: Persistent top-bar CTA throughout the demo. Catches the aha-and-go user (more common than you think).

## Mobile dead-end

**Symptom**: User on phone loads `/demo`, sees "Best viewed on desktop" and a back button.
**Cause**: Defer-to-desktop assumption.
**Fix**: At minimum, a looping video walkthrough. Better: a simplified mobile sandbox. Best: email-capture "send me the desktop link." 52% of top-1% demos ship an optimized mobile experience — the industry is moving on.

## No analytics instrumented

**Symptom**: Demo is live but nobody can answer "what % complete the tour? where do they drop off?"
**Cause**: "We'll add analytics later" that never comes.
**Fix**: Instrument 5 events on day 1: `demo_loaded`, `tour_started`, `step_completed` (per step), `aha_reached`, `cta_clicked`. Without them, you cannot improve the demo.

## Demo treated as one-shot marketing artifact

**Symptom**: Demo shipped, never iterated on.
**Cause**: Demo viewed as launch content, not as a product surface.
**Fix**: Review the demo funnel monthly. The step-with-highest-drop-off is the one to fix — fixing it typically yields +10–15% completion.

## Demo data indistinguishable from real data

**Symptom**: Users confused whether their demo actions are affecting a real account.
**Cause**: No visual cue that this is a sandbox.
**Fix**: Subtle but persistent "Demo mode" indicator in the chrome (top bar stripe, corner badge). Don't be so loud that it kills immersion; just enough for the user to know nothing is at stake.

## Using real customer data as demo seed

**Symptom**: Demo shows "田中太郎" from an actual user's account.
**Cause**: Lazy seeding that reuses production queries.
**Fix**: Use obviously-fictional names (「居酒屋シフトリ」「田中次郎」) and data shaped for the problem/resolution scenario. Privacy risk and weird authenticity both disappear.
