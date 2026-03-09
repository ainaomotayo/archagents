"use client";

import { useState, useRef, useCallback } from "react";

interface PolicyEditorProps {
  initialValue: string;
  onChange?: (value: string) => void;
}

/**
 * YAML policy editor with line numbers.
 *
 * Uses a plain <textarea> styled to look like a code editor,
 * with a synchronised line-number gutter on the left.
 */
export function PolicyEditor({ initialValue, onChange }: PolicyEditorProps) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const lineCount = value.split("\n").length;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setValue(newValue);
      onChange?.(newValue);
    },
    [onChange],
  );

  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
      {/* Line numbers */}
      <div
        ref={lineNumbersRef}
        className="flex-shrink-0 overflow-hidden border-r border-slate-700 bg-slate-900 px-3 py-3 text-right font-mono text-xs leading-6 text-slate-500 select-none"
        aria-hidden="true"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i + 1}>{i + 1}</div>
        ))}
      </div>

      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onScroll={handleScroll}
        spellCheck={false}
        className="flex-1 resize-none bg-transparent px-4 py-3 font-mono text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-600"
        placeholder="# Enter your SENTINEL policy YAML here..."
        rows={Math.max(lineCount, 20)}
        aria-label="Policy YAML editor"
      />
    </div>
  );
}
