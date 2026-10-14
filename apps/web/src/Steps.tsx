import { MAX_STEPS, type Step } from "@app/shared";
import { ActionIcon, Button, Group, Table, Text, Textarea } from "@mantine/core";

const asSteps = (value: unknown): Step[] => (Array.isArray(value) ? (value as Step[]) : []);

/** The steps of a test case as a numbered table. */
export function StepsView({ label, value }: { label: string; value: unknown }) {
  const steps = asSteps(value);
  return (
    <div>
      <Text size="sm" fw={600}>
        {label}
      </Text>
      {steps.length === 0 ? (
        <Text>—</Text>
      ) : (
        <Table withTableBorder bg="white" aria-label={label} style={{ whiteSpace: "pre-wrap" }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={40}>#</Table.Th>
              <Table.Th>Action</Table.Th>
              <Table.Th>Expected result</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {steps.map((step, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a step has no identity but its place in the list
              <Table.Tr key={index}>
                <Table.Td>{index + 1}</Table.Td>
                <Table.Td>{step.action}</Table.Td>
                <Table.Td>{step.expected}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </div>
  );
}

/** Editor for the steps of a test case: add, remove and reorder. An empty list is reported as null, like any empty field. */
export function StepsInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (steps: Step[] | null) => void;
}) {
  const steps = asSteps(value);
  const set = (next: Step[]) => onChange(next.length > 0 ? next : null);
  const edit = (index: number, change: Partial<Step>) =>
    set(steps.map((step, at) => (at === index ? { ...step, ...change } : step)));
  const swap = (index: number, other: number) =>
    set(steps.map((step, at) => (at === index ? steps[other] : at === other ? steps[index] : step) as Step));

  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <Text component="legend" size="sm" fw={500} mb={4}>
        {label}
      </Text>
      {steps.map((step, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a step has no identity but its place in the list
        <Group key={index} gap="xs" align="flex-start" wrap="nowrap" mb={6}>
          <Text size="sm" w={24} pt={6} ta="right" c="dimmed">
            {index + 1}
          </Text>
          <Textarea
            aria-label={`Action of step ${index + 1}`}
            placeholder="Action"
            autosize
            minRows={1}
            maxLength={2000}
            flex={1}
            value={step.action}
            onChange={(e) => edit(index, { action: e.currentTarget.value })}
          />
          <Textarea
            aria-label={`Expected result of step ${index + 1}`}
            placeholder="Expected result"
            autosize
            minRows={1}
            maxLength={2000}
            flex={1}
            value={step.expected}
            onChange={(e) => edit(index, { expected: e.currentTarget.value })}
          />
          <ActionIcon.Group mt={4}>
            <ActionIcon
              variant="default"
              aria-label={`Move step ${index + 1} up`}
              disabled={index === 0}
              onClick={() => swap(index, index - 1)}
            >
              ↑
            </ActionIcon>
            <ActionIcon
              variant="default"
              aria-label={`Move step ${index + 1} down`}
              disabled={index === steps.length - 1}
              onClick={() => swap(index, index + 1)}
            >
              ↓
            </ActionIcon>
            <ActionIcon
              variant="default"
              aria-label={`Remove step ${index + 1}`}
              onClick={() => set(steps.filter((_, at) => at !== index))}
            >
              ✕
            </ActionIcon>
          </ActionIcon.Group>
        </Group>
      ))}
      <Button
        size="compact-sm"
        variant="default"
        disabled={steps.length >= MAX_STEPS}
        onClick={() => set([...steps, { action: "", expected: "" }])}
      >
        Add step
      </Button>
    </fieldset>
  );
}
