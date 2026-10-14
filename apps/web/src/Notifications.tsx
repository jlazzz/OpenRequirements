import {
  ActionIcon,
  Button,
  Group,
  Indicator,
  Popover,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "./api.ts";

type EmailChoice = "each" | "digest" | "off";
type Notification = { id: string; kind: string; text: string; path: string; createdAt: string; readAt: string | null };
type Notifications = { notifications: Notification[]; unread: number; emailNotifications: EmailChoice; mail: boolean };

const useNotifications = () =>
  useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<Notifications>("notifications"),
    refetchInterval: 60_000,
  });

/** The bell in the header: unread count, the latest notifications, each leading to what it is about. */
export function NotificationBell() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const data = useNotifications().data;
  const read = useMutation({
    mutationFn: (ids?: string[]) => api("notifications/read", ids ? { ids } : {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unread = data?.unread ?? 0;
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  const open = (n: Notification) => {
    if (!n.readAt) read.mutate([n.id]);
    setOpened(false);
    router.history.push(n.path);
  };

  return (
    <Popover opened={opened} onChange={setOpened} width={360} position="bottom-end" shadow="md">
      <Popover.Target>
        <Indicator label={unread > 99 ? "99+" : unread} size={16} disabled={unread === 0} color="red" offset={4}>
          <ActionIcon
            variant="subtle"
            color="gray.3"
            size="md"
            aria-label={label}
            title={label}
            onClick={() => setOpened((o) => !o)}
          >
            <svg
              aria-hidden
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <Group justify="space-between" px="sm" py={6}>
          <Text fw={600} size="sm">
            Notifications
          </Text>
          {unread > 0 && (
            <Button size="compact-xs" variant="subtle" onClick={() => read.mutate(undefined)}>
              Mark all read
            </Button>
          )}
        </Group>
        <ScrollArea.Autosize mah={420}>
          {data?.notifications.length === 0 && (
            <Text size="sm" c="dimmed" px="sm" pb="sm">
              Nothing yet. Mentions, review invitations, assigned test runs and relationships that became suspect show
              here.
            </Text>
          )}
          <Stack gap={0}>
            {data?.notifications.map((n) => (
              <UnstyledButton
                key={n.id}
                onClick={() => open(n)}
                px="sm"
                py={6}
                style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
              >
                <Text size="sm" fw={n.readAt ? 400 : 600} lineClamp={3}>
                  {n.text}
                </Text>
                <Text size="xs" c="dimmed">
                  {n.readAt ? "" : "Unread · "}
                  {new Date(n.createdAt).toLocaleString()}
                </Text>
              </UnstyledButton>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}

/** How notifications reach the signed-in person by email. */
export function EmailSetting() {
  const queryClient = useQueryClient();
  const data = useNotifications().data;
  const save = useMutation({
    mutationFn: (emailNotifications: EmailChoice) => api("account", { emailNotifications }, "PATCH"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  if (!data) return null;
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        Email me about notifications
      </Text>
      <SegmentedControl
        aria-label="Email me about notifications"
        value={(!save.isError && save.variables) || data.emailNotifications}
        onChange={(value) => save.mutate(value as EmailChoice)}
        data={[
          { value: "each", label: "Each time" },
          { value: "digest", label: "Daily digest" },
          { value: "off", label: "Never" },
        ]}
      />
      {!data.mail && (
        <Text size="xs" c="dimmed">
          This server has no email set up yet. Your choice applies once it has.
        </Text>
      )}
    </Stack>
  );
}
