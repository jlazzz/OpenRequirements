import { ActionIcon, Alert, Box, Button, Group, Menu, Stack, Text, Textarea, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Comment, canComment, type Member, type ProjectDetail } from "./api.ts";
import { useSession } from "./Root.tsx";

type People = { members: Member[]; instanceAdmins: { userId: string; name: string }[] };

/** Side panel with the comments on an item. Reviewers and above can post; @Name mentions a project member. */
export function Comments({ data, itemId }: { data: ProjectDetail; itemId: string }) {
  const projectId = data.project.id;
  const me = useSession().data?.user;
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const comments = useQuery({
    queryKey: ["items", itemId, "comments"],
    queryFn: () => api<{ comments: Comment[] }>(`items/${itemId}/comments`),
  });
  const people = useQuery({
    queryKey: ["projects", projectId, "members"],
    queryFn: () => api<People>(`projects/${projectId}/members`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["items", itemId, "comments"] });
  const post = useMutation({
    mutationFn: () => api(`items/${itemId}/comments`, { body }),
    onSuccess: () => {
      setBody("");
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`comments/${id}`, undefined, "DELETE"),
    onSuccess: refresh,
  });
  const names = [
    ...new Set([...(people.data?.members ?? []), ...(people.data?.instanceAdmins ?? [])].map((p) => p.name)),
  ].sort();
  const rows = comments.data?.comments ?? [];

  return (
    <Box component="aside" aria-label="Comments">
      <Title order={2} size="h5" mb={4}>
        Comments ({rows.length})
      </Title>
      {(comments.isError || post.isError || remove.isError) && (
        <Alert color="red" role="alert">
          {(comments.error ?? post.error ?? remove.error)?.message}
        </Alert>
      )}
      <Stack gap="sm">
        {rows.map((comment) => (
          <div key={comment.id}>
            <Group gap={4} wrap="nowrap" align="flex-start">
              <Text size="xs" c="dimmed" flex={1}>
                <Text span fw={600} c="var(--mantine-color-bright)" inherit>
                  {comment.author}
                </Text>{" "}
                · {new Date(comment.createdAt).toLocaleString()}
                {comment.review && ` · in review "${comment.review}"`}
              </Text>
              {(comment.authorId === me?.id || data.role === "admin") && (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label={`Delete comment by ${comment.author}`}
                  onClick={() => remove.mutate(comment.id)}
                >
                  ×
                </ActionIcon>
              )}
            </Group>
            <Text
              size="sm"
              style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
              bg={me && comment.mentions.includes(me.id) ? "yellow.0" : undefined}
            >
              {comment.body}
            </Text>
          </div>
        ))}
        {canComment(data.role) ? (
          <Stack gap={6}>
            <Textarea
              aria-label="New comment"
              placeholder="Write a comment"
              autosize
              minRows={2}
              maxLength={5000}
              value={body}
              onChange={(e) => setBody(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Button size="compact-sm" disabled={!body.trim()} loading={post.isPending} onClick={() => post.mutate()}>
                Post
              </Button>
              <Menu>
                <Menu.Target>
                  <Button size="compact-sm" variant="default">
                    @ Mention
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {names.map((name) => (
                    <Menu.Item
                      key={name}
                      onClick={() =>
                        setBody((previous) => `${previous}${previous && !/\s$/.test(previous) ? " " : ""}@${name} `)
                      }
                    >
                      {name}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Stack>
        ) : (
          <Text size="xs" c="dimmed">
            Your role in this project is Viewer, so you can read comments but not post.
          </Text>
        )}
      </Stack>
    </Box>
  );
}
