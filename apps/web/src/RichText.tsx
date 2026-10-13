import "@mantine/tiptap/styles.css";
import type { RichNode } from "@app/shared";
import { Input } from "@mantine/core";
import { Link, RichTextEditor } from "@mantine/tiptap";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/**
 * Rich-text field. Uncontrolled: `initial` is read once, so remount it (change its key) to load other content.
 * New node or mark types must also be allowed in packages/shared/src/richtext.ts, or saving is refused.
 */
export function RichTextInput({
  label,
  initial,
  onChange,
}: {
  label: string;
  initial: RichNode;
  onChange: (doc: RichNode) => void;
}) {
  const editor = useEditor({
    // StarterKit's own link is replaced by Mantine's, which adds the toolbar's link dialog.
    extensions: [StarterKit.configure({ link: false }), Link],
    content: initial,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { "aria-label": label } },
    onUpdate: ({ editor: current }) => onChange(current.getJSON() as RichNode),
  });

  return (
    <Input.Wrapper label={label} labelElement="div">
      <RichTextEditor editor={editor}>
        <RichTextEditor.Toolbar>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Bold />
            <RichTextEditor.Italic />
            <RichTextEditor.Underline />
            <RichTextEditor.Strikethrough />
            <RichTextEditor.Code />
          </RichTextEditor.ControlsGroup>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.H2 />
            <RichTextEditor.H3 />
          </RichTextEditor.ControlsGroup>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.BulletList />
            <RichTextEditor.OrderedList />
            <RichTextEditor.Blockquote />
          </RichTextEditor.ControlsGroup>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Link />
            <RichTextEditor.Unlink />
          </RichTextEditor.ControlsGroup>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Undo />
            <RichTextEditor.Redo />
          </RichTextEditor.ControlsGroup>
        </RichTextEditor.Toolbar>
        <RichTextEditor.Content mih={120} />
      </RichTextEditor>
    </Input.Wrapper>
  );
}
