import {
  Alert,
  Badge,
  Button,
  Container,
  CopyButton,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { api, type Session, type User } from "./api.ts";
import { useSession } from "./Root.tsx";

type Accounts = {
  users: (User & { createdAt: string; deactivatedAt: string | null })[];
  invitations: { id: string; email: string; expiresAt: string }[];
};

/** Instance administrators: everyone with an account, and invitations for new people. */
export function UsersPage() {
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: ["users"], queryFn: () => api<Accounts>("users") });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["users"] });
  const invite = useMutation({
    mutationFn: (email: string) => api<{ email: string; token: string }>("invitations", { email }),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`invitations/${id}`, undefined, "DELETE"),
    onSuccess: refresh,
  });
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api(`users/${id}/active`, { active }, "PUT"),
    onSuccess: refresh,
  });
  const me = useSession().data?.user?.id;
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    invite.mutate(String(new FormData(event.currentTarget).get("email")));
    event.currentTarget.reset();
  };
  const link = invite.data ? `${window.location.origin}/invite/${invite.data.token}` : "";

  return (
    <Container size="md" py="lg">
      <Stack gap="lg">
        <Title order={1} size="h2">
          Users
        </Title>
        {(accounts.isError || invite.isError || revoke.isError) && (
          <Alert color="red" role="alert">
            {(accounts.error ?? invite.error ?? revoke.error)?.message}
          </Alert>
        )}

        <section>
          <Title order={2} size="h4" mb="xs">
            Invite someone
          </Title>
          <form onSubmit={onSubmit}>
            <Group align="flex-end">
              <TextInput name="email" type="email" label="Email" required w={320} />
              <Button type="submit" loading={invite.isPending}>
                Create invitation link
              </Button>
            </Group>
          </form>
          {invite.data && (
            <Alert color="blue" mt="sm" title={`Send this link to ${invite.data.email}`}>
              <Stack gap="xs" align="flex-start">
                <Text size="sm">
                  No email is sent for you. The link works once, for 7 days, and is shown only now. After they join, add
                  them to a project under that project's Members.
                </Text>
                <TextInput
                  aria-label="Invitation link"
                  value={link}
                  readOnly
                  w="100%"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <CopyButton value={link}>
                  {({ copied, copy }) => (
                    <Button size="compact-sm" variant="default" onClick={copy}>
                      {copied ? "Copied" : "Copy link"}
                    </Button>
                  )}
                </CopyButton>
              </Stack>
            </Alert>
          )}
        </section>

        {accounts.data && accounts.data.invitations.length > 0 && (
          <section>
            <Title order={2} size="h4" mb="xs">
              Invitations not yet used
            </Title>
            <Table withTableBorder bg="var(--mantine-color-body)">
              <Table.Tbody>
                {accounts.data.invitations.map((invitation) => (
                  <Table.Tr key={invitation.id}>
                    <Table.Td>{invitation.email}</Table.Td>
                    <Table.Td>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</Table.Td>
                    <Table.Td ta="right">
                      <Button size="compact-sm" variant="default" onClick={() => revoke.mutate(invitation.id)}>
                        Revoke
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </section>
        )}

        <section>
          <Title order={2} size="h4" mb="xs">
            Accounts
          </Title>
          {setActive.isError && (
            <Alert color="red" role="alert" mb="xs">
              {setActive.error.message}
            </Alert>
          )}
          <Table withTableBorder bg="var(--mantine-color-body)">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Joined</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {accounts.data?.users.map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    {user.name}{" "}
                    {user.isAdmin && (
                      <Badge variant="light" size="sm" radius="sm">
                        Administrator
                      </Badge>
                    )}
                    {user.deactivatedAt && (
                      <Badge variant="light" color="gray" size="sm" radius="sm">
                        Deactivated
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>{user.email}</Table.Td>
                  <Table.Td>{new Date(user.createdAt).toLocaleDateString()}</Table.Td>
                  <Table.Td ta="right">
                    {user.id !== me && (
                      <Button
                        size="compact-sm"
                        variant="default"
                        aria-label={`${user.deactivatedAt ? "Activate" : "Deactivate"} ${user.name}`}
                        onClick={() => setActive.mutate({ id: user.id, active: Boolean(user.deactivatedAt) })}
                      >
                        {user.deactivatedAt ? "Activate" : "Deactivate"}
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </section>
      </Stack>
    </Container>
  );
}

/** Where an invitation link lands: choose a name and password to create the account. */
export function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const invitation = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api<{ email: string }>(`invitations/accept/${token}`),
  });
  const accept = useMutation({
    mutationFn: (fields: object) => api<{ user: User }>("invitations/accept", { token, ...fields }),
    onSuccess: async ({ user }) => {
      queryClient.clear();
      queryClient.setQueryData<Session>(["session"], { user, needsSetup: false });
      await navigate({ to: "/" });
    },
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    accept.mutate(Object.fromEntries(new FormData(event.currentTarget)));
  };

  return (
    <Container size={400} py={80}>
      {invitation.isError && (
        <Alert color="red" role="alert" title="This invitation cannot be used">
          {invitation.error.message}
        </Alert>
      )}
      {invitation.data && (
        <form onSubmit={onSubmit}>
          <Stack gap="sm">
            <Title order={1} size="h3">
              Create your account
            </Title>
            <Text c="dimmed" size="sm">
              You were invited as {invitation.data.email}.
            </Text>
            <TextInput name="name" label="Name" required maxLength={100} autoComplete="name" />
            <TextInput
              name="password"
              type="password"
              label="Password"
              description="At least 12 characters."
              required
              minLength={12}
              autoComplete="new-password"
            />
            {accept.isError && (
              <Alert color="red" role="alert">
                {accept.error.message}
              </Alert>
            )}
            <Button type="submit" loading={accept.isPending}>
              Create account
            </Button>
          </Stack>
        </form>
      )}
    </Container>
  );
}
