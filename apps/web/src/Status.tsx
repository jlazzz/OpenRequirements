import { Badge, Box, Tooltip } from "@mantine/core";

// The colour of each state. A state not listed here is shown in grey.
const COLORS: Record<string, string> = {
  proposed: "blue",
  draft: "gray",
  "in review": "yellow",
  approved: "green",
  rejected: "red",
  obsolete: "dark",
  passed: "teal",
  failed: "red",
};
const colorOf = (status: string) => COLORS[status.toLowerCase()] ?? "gray";

/** An item's state as a coloured label. Renders nothing for an item with no state. */
export function StatusBadge({ status }: { status: unknown }) {
  if (typeof status !== "string" || !status) return null;
  return (
    <Badge color={colorOf(status)} variant="light" radius="sm" size="sm" style={{ flexShrink: 0 }}>
      {status}
    </Badge>
  );
}

/** The same state as a small coloured dot, for places with no room for a label. The state is also given in words. */
export function StatusDot({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return (
    <Tooltip label={status}>
      <Box
        component="span"
        role="img"
        aria-label={`State: ${status}`}
        w={8}
        h={8}
        bg={`${colorOf(status)}.6`}
        style={{ borderRadius: "50%", display: "inline-block", flexShrink: 0 }}
      />
    </Tooltip>
  );
}

const paths = {
  // A stack of sheets, a folder, a single sheet.
  set: "M3 4h10v2H3zM3 7h10v2H3zM3 10h10v2H3z",
  folder: "M2 4h4l1.5 1.5H14V12H2z",
  item: "M4 2h5l3 3v9H4zM9 2v3h3",
};

/** Small picture telling a set, a folder and an item apart in the explorer. Decorative: the row's label names the thing. */
export function KindIcon({ kind }: { kind: keyof typeof paths }) {
  const color = {
    set: "var(--mantine-color-blue-7)",
    folder: "var(--mantine-color-yellow-7)",
    item: "var(--mantine-color-gray-6)",
  }[kind];
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0, display: "block" }}>
      <path
        d={paths[kind]}
        fill={kind === "item" ? "none" : color}
        stroke={color}
        strokeWidth={kind === "item" ? 1.3 : 0}
        strokeLinejoin="round"
      />
    </svg>
  );
}
