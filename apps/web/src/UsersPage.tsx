import {
  Alert,
  Badge,
  Button,
  Container,
  CopyButton,
  Group,
  PasswordInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { FormEvent, ReactNode } from "react";
import { api, type Session, type User } from "./api.ts";
import { useSession } from "./Root.tsx";

type Accounts = {
  users: (User & { createdAt: string; deactivatedAt: string | null })[];
  invitations: { id: string; email: string; expiresAt: string }[];
};

type AuditCheck = {
  ok: boolean;
  checked: number;
  lastSeq: number;
  unchained: number;
  firstBroken: { seq: number; id: string; reason: "sequence" | "link" | "content" } | null;
};

const BROKEN = {
  content: "its content does not match its hash: the row was changed",
  link: "it does not follow from the row before it: an earlier row was changed",
  sequence: "a row is missing before it",
} as const;

/** Checks the audit log's hash chain on demand and names the first row that does not fit. */
function AuditVerify() {
  const check = useMutation({ mutationFn: () => api<AuditCheck>("audit/verify") });
  const result = check.data;
  return (
    <section>
      <Title order={2} size="h4" mb="xs">
        Audit log integrity
      </Title>
      <Text size="sm" c="dimmed" mb="xs">
        Every change is chained to the one before it. Checking reads the whole log, so it can take a moment.
      </Text>
      <Button variant="default" loading={check.isPending} onClick={() => check.mutate()}>
        Verify audit log
      </Button>
      {check.isError && (
        <Alert color="red" role="alert" mt="xs">
          {check.error.message}
        </Alert>
      )}
      {result && (
        <Alert color={result.ok ? "green" : "red"} role="status" mt="xs">
          {result.ok
            ? `Intact: ${result.checked} events checked.`
            : `Broken at event ${result.firstBroken?.seq}: ${result.firstBroken ? BROKEN[result.firstBroken.reason] : ""}.`}
          {result.unchained > 0 &&
            ` ${result.unchained} older events were written before the chain and are not covered.`}
        </Alert>
      )}
    </section>
  );
}

/** Instance administrators: everyone with an account, and invitations for new people. */
export function UsersPage() {
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: ["users"], queryFn: () => api<Accounts>("users") });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["users"] });
  const invite = useMutation({
    mutationFn: (email: string) => api<{ email: string; token: string; emailed: boolean }>("invitations", { email }),
    onSuccess: refresh,
  });
  const reset = useMutation({
    mutationFn: async (user: User) => ({
      user,
      ...(await api<{ token: string; emailed: boolean }>(`users/${user.id}/password-reset`, {})),
    }),
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
        {(accounts.isError || invite.isError || revoke.isError || reset.isError) && (
          <Alert color="red" role="alert">
            {(accounts.error ?? invite.error ?? revoke.error ?? reset.error)?.message}
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
            <LinkAlert
              title={
                invite.data.emailed
                  ? `Invitation emailed to ${invite.data.email}`
                  : `Send this link to ${invite.data.email}`
              }
              label="Invitation link"
              link={link}
            >
              {invite.data.emailed
                ? "If it does not arrive, send them this link yourself. "
                : "No email is sent for you. "}
              The link works once, for 7 days, and is shown only now. After they join, add them to a project under that
              project's Members.
            </LinkAlert>
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
          {reset.data && (
            <LinkAlert
              title={
                reset.data.emailed
                  ? `Password reset link emailed to ${reset.data.user.name}`
                  : `Send this link to ${reset.data.user.name}`
              }
              label="Password reset link"
              link={`${window.location.origin}/reset-password/${reset.data.token}`}
            >
              It lets them choose a new password, once, within 3 days, and is shown only now. Their current password
              keeps working until then.
            </LinkAlert>
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
                    {!user.deactivatedAt && (
                      <Button
                        size="compact-sm"
                        variant="default"
                        mr="xs"
                        aria-label={`Make a password reset link for ${user.name}`}
                        onClick={() => reset.mutate(user)}
                        loading={reset.isPending && reset.variables?.id === user.id}
                      >
                        Reset link
                      </Button>
                    )}
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
        <AuditVerify />
      </Stack>
    </Container>
  );
}

/** A one-time link for the administrator to copy. */
function LinkAlert({
  title,
  label,
  link,
  children,
}: {
  title: string;
  label: string;
  link: string;
  children: ReactNode;
}) {
  return (
    <Alert color="blue" mt="sm" mb="xs" title={title}>
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{children}</Text>
        <TextInput aria-label={label} value={link} readOnly w="100%" onFocus={(e) => e.currentTarget.select()} />
        <CopyButton value={link}>
          {({ copied, copy }) => (
            <Button size="compact-sm" variant="default" onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </Button>
          )}
        </CopyButton>
      </Stack>
    </Alert>
  );
}

/** Where a password reset link lands: choose a new password, which also signs the person in. */
export function ResetPasswordPage() {
  const { token } = useParams({ from: "/reset-password/$token" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const link = useQuery({
    queryKey: ["password-reset", token],
    queryFn: () => api<{ email: string }>(`password/reset/${token}`),
  });
  const reset = useMutation({
    mutationFn: (fields: object) => api<{ user: User }>("password/reset", { token, ...fields }),
    onSuccess: async ({ user }) => {
      queryClient.clear();
      queryClient.setQueryData<Session>(["session"], (old) => ({ ...old, user, needsSetup: false }));
      await navigate({ to: "/" });
    },
  });
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    reset.mutate(Object.fromEntries(new FormData(event.currentTarget)));
  };

  return (
    <Container size={400} py={80}>
      {link.isError && (
        <Alert color="red" role="alert" title="This link cannot be used">
          {link.error.message}
        </Alert>
      )}
      {link.data && (
        <form onSubmit={onSubmit}>
          <Stack gap="sm">
            <Title order={1} size="h3">
              Choose a new password
            </Title>
            <Text c="dimmed" size="sm">
              For {link.data.email}. You are signed out everywhere else once it is set.
            </Text>
            <PasswordInput
              name="password"
              label="New password"
              description="At least 12 characters."
              required
              minLength={12}
              autoComplete="new-password"
            />
            {reset.isError && (
              <Alert color="red" role="alert">
                {reset.error.message}
              </Alert>
            )}
            <Button type="submit" loading={reset.isPending}>
              Set password and sign in
            </Button>
          </Stack>
        </form>
      )}
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
      queryClient.setQueryData<Session>(["session"], (old) => ({ ...old, user, needsSetup: false }));
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
