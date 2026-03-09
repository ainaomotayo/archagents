"use client";

import { useState, useRef, useCallback } from "react";

interface PolicyEditorProps {
  initialValue: string;
  onChange?: (value: string) => void;
}

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
    <div className="flex overflow-hidden rounded-xl border border-border bg-surface-0">
      {/* Line numbers */}
      <div
        ref={lineNumbersRef}
        className="flex-shrink-0 overflow-hidden border-r border-border bg-surface-1 px-3 py-3 text-right font-mono text-[11px] leading-6 text-text-tertiary select-none"
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
        className="flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-6 text-text-primary outline-none placeholder:text-text-tertiary"
        placeholder="# Enter your SENTINEL policy YAML here..."
        rows={Math.max(lineCount, 20)}
        aria-label="Policy YAML editor"
      />
    </div>
  );
}
