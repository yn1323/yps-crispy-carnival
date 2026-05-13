export const DemoHighlightStyles = () => (
  <style>{`
    @keyframes shiftori-demo-soft-pulse {
      0%, 100% {
        background-color: #0f766e;
        box-shadow: 0 0 0 0 rgba(13, 148, 136, 0.26), 0 1px 2px rgba(13, 148, 136, 0.18);
        outline-color: rgba(13, 148, 136, 0.26);
      }
      50% {
        background-color: #14b8a6;
        box-shadow: 0 0 0 10px rgba(20, 184, 166, 0.2), 0 6px 16px rgba(13, 148, 136, 0.2);
        outline-color: rgba(20, 184, 166, 0.52);
      }
    }

    [data-demo-primary],
    [data-demo-step="submit"] [data-submit-action="primary"],
    [data-demo-step="adjust"] [data-tour="confirm-button"] {
      animation: shiftori-demo-soft-pulse 3.2s ease-in-out infinite;
      outline: 2px solid rgba(13, 148, 136, 0.26);
      outline-offset: 2px;
      position: relative;
      z-index: 1;
    }
  `}</style>
);
