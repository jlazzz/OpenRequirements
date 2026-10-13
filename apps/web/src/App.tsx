import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { api, type Project, type Session, type User } from "./api.ts";

export function App() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => api<Session>("session") });

  if (session.isPending) return <p className="center">Loading…</p>;
  if (session.isError) return <p className="center error">Cannot reach the server: {session.error.message}</p>;
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
    <main className="auth">
      <form onSubmit={onSubmit}>
        <h1>{setup ? "Create the admin account" : "Sign in"}</h1>
        {setup && <p>This is a new install. The first account becomes the administrator.</p>}
        {setup && (
          <label>
            Name
            <input name="name" required maxLength={100} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={setup ? 12 : undefined}
            autoComplete={setup ? "new-password" : "current-password"}
            aria-describedby={setup ? "password-hint" : undefined}
          />
        </label>
        {setup && <small id="password-hint">At least 12 characters.</small>}
        {submit.isError && (
          <p className="error" role="alert">
            {submit.error.message}
          </p>
        )}
        <button type="submit" disabled={submit.isPending}>
          {setup ? "Create account" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

function Shell({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api("logout", {}),
    onSuccess: () => queryClient.setQueryData<Session>(["session"], { user: null, needsSetup: false }),
  });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<{ projects: Project[] }>("projects") });

  return (
    <>
      <header className="topbar">
        <strong>Requirements</strong>
        <nav aria-label="Main">
          <a href="/" aria-current="page">
            Projects
          </a>
        </nav>
        <span className="spacer" />
        <span>{user.name}</span>
        <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
          Sign out
        </button>
      </header>
      <main className="page">
        <h1>Projects</h1>
        {projects.isPending && <p>Loading…</p>}
        {projects.isError && (
          <p className="error" role="alert">
            {projects.error.message}
          </p>
        )}
        {projects.data?.projects.length === 0 && <p className="empty">No projects yet.</p>}
        <ul>
          {projects.data?.projects.map((project) => (
            <li key={project.id}>{project.name}</li>
          ))}
        </ul>
      </main>
    </>
  );
}
