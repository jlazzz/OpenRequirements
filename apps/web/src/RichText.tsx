import "@mantine/tiptap/styles.css";
import "katex/dist/katex.min.css";
import type { RichNode } from "@app/shared";
import { Input } from "@mantine/core";
import { Link, RichTextEditor } from "@mantine/tiptap";
import Image from "@tiptap/extension-image";
import { Mathematics } from "@tiptap/extension-mathematics";
import { TableKit } from "@tiptap/extension-table";
import { type Editor, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRef, useState } from "react";

type Props = {
  label: string;
  initial: RichNode;
  onChange: (doc: RichNode) => void;
  /** Stores an image file and returns the address to embed. */
  uploadImage: (file: File) => Promise<string>;
  /** Least height of the writing area, in pixels. */
  minHeight?: number;
};

/**
 * Rich-text field. Uncontrolled: `initial` is read once, so remount it (change its key) to load other content.
 * New node or mark types must also be allowed in packages/shared/src/richtext.ts, or saving is refused.
 */
export function RichTextInput({ label, initial, onChange, uploadImage, minHeight = 120 }: Props) {
  const [problem, setProblem] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const insertImages = (files: Iterable<File>) => {
    const images = [...files].filter((file) => file.type.startsWith("image/"));
    for (const file of images) {
      uploadImage(file).then(
        (src) => editorRef.current?.chain().focus().setImage({ src, alt: file.name }).run(),
        (error: Error) => setProblem(`${file.name}: ${error.message}`),
      );
    }
    return images.length > 0;
  };
  const editEquation = (kind: "inline" | "block") => (node: { attrs: Record<string, unknown> }, pos: number) => {
    const latex = window.prompt("Equation (LaTeX)", String(node.attrs.latex ?? ""));
    if (latex === null) return;
    const chain = editorRef.current?.chain().setNodeSelection(pos);
    (kind === "inline" ? chain?.updateInlineMath({ latex }) : chain?.updateBlockMath({ latex }))?.focus().run();
  };

  const editor = useEditor({
    extensions: [
      // StarterKit's own link is replaced by Mantine's, which adds the toolbar's link dialog.
      StarterKit.configure({ link: false }),
      Link,
      TableKit.configure({ table: { resizable: false } }),
      Image,
      Mathematics.configure({
        katexOptions: { throwOnError: false },
        inlineOptions: { onClick: editEquation("inline") },
        blockOptions: { onClick: editEquation("block") },
      }),
    ],
    content: initial,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { "aria-label": label },
      // Pasted or dropped image files are uploaded and embedded.
      handlePaste: (_view, event) => insertImages(event.clipboardData?.files ?? []),
      handleDrop: (_view, event) => insertImages(event.dataTransfer?.files ?? []),
    },
    onUpdate: ({ editor: current }) => onChange(current.getJSON() as RichNode),
  });
  editorRef.current = editor;

  const inTable = editor?.isActive("table") ?? false;
  const control = (title: string, text: string, run: () => void) => (
    <RichTextEditor.Control title={title} aria-label={title} onClick={run} px={6} fz="xs" style={{ width: "auto" }}>
      {text}
    </RichTextEditor.Control>
  );
  const insertEquation = () => {
    const latex = window.prompt("Equation (LaTeX), for example: V = I \\cdot R");
    if (latex) editor?.chain().focus().insertInlineMath({ latex }).run();
  };

  return (
    <Input.Wrapper label={label} labelElement="div" error={problem}>
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
            {control("Insert table", "Table", () =>
              editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
            )}
            {control("Insert image", "Image", () => fileInput.current?.click())}
            {control("Insert equation", "Equation", insertEquation)}
          </RichTextEditor.ControlsGroup>
          {inTable && (
            <RichTextEditor.ControlsGroup>
              {control("Add row below", "+ Row", () => editor?.chain().focus().addRowAfter().run())}
              {control("Add column to the right", "+ Column", () => editor?.chain().focus().addColumnAfter().run())}
              {control("Delete row", "− Row", () => editor?.chain().focus().deleteRow().run())}
              {control("Delete column", "− Column", () => editor?.chain().focus().deleteColumn().run())}
              {control("Delete table", "Delete table", () => editor?.chain().focus().deleteTable().run())}
            </RichTextEditor.ControlsGroup>
          )}
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Undo />
            <RichTextEditor.Redo />
          </RichTextEditor.ControlsGroup>
        </RichTextEditor.Toolbar>
        <RichTextEditor.Content mih={minHeight} />
      </RichTextEditor>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(event) => {
          setProblem(null);
          insertImages(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
        }}
      />
    </Input.Wrapper>
  );
}
