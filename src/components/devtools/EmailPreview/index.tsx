type Props = {
  html: string;
  width?: number | string;
  height?: number | string;
};

export function EmailPreview({ html, width = 480, height = 800 }: Props) {
  return (
    <iframe
      title="email preview"
      srcDoc={html}
      sandbox="allow-same-origin"
      style={{
        width,
        height,
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        backgroundColor: "#f7fafc",
      }}
    />
  );
}
