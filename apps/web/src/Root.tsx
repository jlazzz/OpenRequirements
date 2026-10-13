import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { api, type Session, type User } from "./api.ts";
import { RouterAnchor } from "./links.tsx";

export function useSession() {
  return useQuery({ queryKey: ["session"], queryFn: () => api<Session>("session") });
}

export function Root() {
  const session = useSession();
  // An invited person has no account yet, so the invitation page is shown without signing in.
  const invited = useLocation({ select: (location) => location.pathname.startsWith("/invite/") });

  if (session.isPending) {
    return (
      <Center h="100vh">
        <Loader aria-label="Loading" />
      </Center>
    );
  }
  if (session.isError) {
    return (
      <Center h="100vh">
        <Alert color="red" title="Cannot reach the server">
          {session.error.message}
        </Alert>
      </Center>
    );
  }
  if (invited) return <Outlet />;
  if (session.data.needsSetup) return <AuthForm mode="setup" />;
  if (!session.data.user) return <AuthForm mode="login" />;
  return <Shell user={session.data.user} />;
}

function AuthForm({ mode }: { mode: "setup" | "login" }) {
  const queryClient = useQueryClient();
  const submit = useMutation({
    mutationFn: (fields: object) => api<{ user: User }>(mode, fields),
    onSuccess: ({ user }) => queryClient.setQueryData<Session>(["session"], { user, needsSetup: false }),
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit.mutate(Object.fromEntries(new FormData(event.currentTarget)));
  };
  const setup = mode === "setup";

  return (
    <Center mih="100vh" p="md" bg="gray.1">
      <Paper component="form" onSubmit={onSubmit} withBorder p="lg" w={360} maw="100%">
        <Stack gap="sm">
          <Title order={1} size="h3">
            {setup ? "Create the admin account" : "Sign in"}
          </Title>
          {setup && (
            <Text c="dimmed" size="sm">
              This is a new install. The first account becomes the administrator.
            </Text>
          )}
          {setup && <TextInput name="name" label="Name" required maxLength={100} autoComplete="name" />}
          <TextInput name="email" type="email" label="Email" required autoComplete="username" />
          <PasswordInput
            name="password"
            label="Password"
            description={setup ? "At least 12 characters." : undefined}
            required
            minLength={setup ? 12 : undefined}
            autoComplete={setup ? "new-password" : "current-password"}
          />
          {submit.isError && (
            <Alert color="red" role="alert">
              {submit.error.message}
            </Alert>
          )}
          <Button type="submit" loading={submit.isPending}>
            {setup ? "Create account" : "Sign in"}
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}

const TOPBAR_HEIGHT = 44;

function Shell({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api("logout", {}),
    // Drop every cached query, so the next user never sees this user's data.
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData<Session>(["session"], { user: null, needsSetup: false });
    },
  });

  return (
    <>
      <Group component="header" h={TOPBAR_HEIGHT} px="md" gap="lg" bg="dark.7" c="white" wrap="nowrap">
        <Text fw={700}>Requirements</Text>
        <nav aria-label="Main">
          <RouterAnchor to="/" c="white" size="sm">
            Projects
          </RouterAnchor>
          {user.isAdmin && (
            <RouterAnchor to="/users" c="white" size="sm" ml="lg">
              Users
            </RouterAnchor>
          )}
        </nav>
        <Text size="sm" ml="auto">
          {user.name}
        </Text>
        <Button size="compact-sm" variant="default" onClick={() => logout.mutate()} loading={logout.isPending}>
          Sign out
        </Button>
      </Group>
      <main style={{ height: `calc(100vh - ${TOPBAR_HEIGHT}px)`, overflow: "auto" }}>
        <Outlet />
      </main>
    </>
  );
}
