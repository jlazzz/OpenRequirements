import { ActionIcon, Anchor, Text } from "@mantine/core";
import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** The user guide is a separate static site served at /help, so these are plain links, not router links. */
export function helpUrl(page: string): string {
  return page === "index" ? "/help/" : `/help/${page}`;
}

// The first matching entry wins; the pattern is matched against the part of the path after /projects/:id/.
const SCREENS: [RegExp, string][] = [
  [/^(sets|folders|items)\/[^/]+\/impact/, "trace"],
  [/^(sets|folders)\/[^/]+$/, "getting-started"],
  [/^items\//, "getting-started"],
  [/^(members|types|baselines|trash)/, "getting-started"],
  [/^(activity)/, "working-together"],
  [/^(suspect|matrix)/, "trace"],
  [/^import/, "reqif"],
  [/^integrations/, "integrations"],
  [/^reviews/, "reviews"],
  [/^(test-plans|cycles|runs|test-runs)/, "test-plans"],
  [/^(reports)/, "evidence-and-reports"],
  [/^ci-runs/, "verification"],
  [/^search/, "getting-started"],
];

/** The guide page that best explains the screen at this path. */
export function helpPage(pathname: string): string {
  if (pathname === "/") return "getting-started";
  if (pathname.startsWith("/users")) return "install";
  if (pathname.startsWith("/api-docs")) return "integrations";
  const inProject = pathname.match(/^\/projects\/[^/]+\/?(.*)$/);
  if (!inProject) return "index";
  const rest = inProject[1] ?? "";
  if (rest === "") return "trace"; // the project home page is the dashboard
  if (/^baselines/.test(rest)) return /^baselines\/.+/.test(rest) ? "evidence-and-reports" : "getting-started";
  return SCREENS.find(([pattern]) => pattern.test(rest))?.[1] ?? "index";
}

/** "?" in the top bar: opens the guide page for the screen that is showing. */
export function HelpButton() {
  const { pathname } = useLocation();
  return (
    <ActionIcon
      component="a"
      href={helpUrl(helpPage(pathname))}
      target="_blank"
      rel="noopener"
      variant="subtle"
      color="gray.3"
      size="md"
      aria-label="Help for this screen"
      title="Help for this screen"
    >
      <span aria-hidden>?</span>
    </ActionIcon>
  );
}

/** Empty-state text: what to do first, with a link to the guide page. */
export function EmptyState({
  children,
  page,
  label = "Read more",
}: {
  children: ReactNode;
  page: string;
  label?: string;
}) {
  return (
    <Text c="dimmed">
      {children}{" "}
      <Anchor href={helpUrl(page)} target="_blank" rel="noopener">
        {label}
      </Anchor>
    </Text>
  );
}
