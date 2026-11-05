type TurnstileApi = NonNullable<Window["turnstile"]>;
export type TurnstileRenderOptions = Parameters<TurnstileApi["render"]>[1];

/**
 * Storyで外部のTurnstile scriptを読み込まず、Cloudflareから届くcallbackを任意の時点で発火する。
 * beforeEachで呼び、返したrestoreをcleanupとして返す。
 */
export function installTurnstileMock() {
  const original = window.turnstile;
  const renders: TurnstileRenderOptions[] = [];
  const removedWidgetIds: string[] = [];

  window.turnstile = {
    render: (_element, options) => {
      renders.push(options);
      return `widget-${renders.length}`;
    },
    remove: (widgetId) => {
      removedWidgetIds.push(widgetId);
    },
  };

  return {
    renders,
    removedWidgetIds,
    latestRender: () => {
      const options = renders.at(-1);
      if (!options) throw new Error("Turnstile widget was not rendered");
      return options;
    },
    restore: () => {
      window.turnstile = original;
    },
  };
}

export type TurnstileMock = ReturnType<typeof installTurnstileMock>;
