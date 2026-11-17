"use client";

import { CSSProperties, KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string };
type Props = { options: SelectOption[]; value?: string; defaultValue?: string; onValueChange?: (value: string) => void; name?: string; label?: string; className?: string; disabled?: boolean };

export function ThemedSelect({ options, value, defaultValue = "", onValueChange, name, label, className = "", disabled = false }: Props) {
  const id = useId(); const root = useRef<HTMLDivElement>(null); const menu = useRef<HTMLDivElement>(null); const [internal, setInternal] = useState(defaultValue); const [open, setOpen] = useState(false); const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const current = value ?? internal; const selected = Math.max(0, options.findIndex((option) => option.value === current));
  useEffect(() => {
    function outside(event: MouseEvent) { if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", outside); return () => document.removeEventListener("mousedown", outside);
  }, []);
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const trigger = root.current.querySelector<HTMLButtonElement>(".themed-select-trigger");
    if (!trigger) return;
    const updatePosition = () => {
      const rect = trigger.getBoundingClientRect();
      const roomBelow = window.innerHeight - rect.bottom - 14;
      const roomAbove = rect.top - 14;
      const opensAbove = roomBelow < 230 && roomAbove > roomBelow;
      const maxHeight = Math.max(100, Math.min(260, opensAbove ? roomAbove : roomBelow));
      const width = Math.min(rect.width, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const top = opensAbove ? Math.max(12, rect.top - maxHeight - 8) : rect.bottom + 8;
      setMenuStyle({ position: "fixed", top, left, width, maxHeight, zIndex: 1400, transformOrigin: opensAbove ? "bottom center" : "top center" });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => { window.removeEventListener("resize", updatePosition); document.removeEventListener("scroll", updatePosition, true); };
  }, [open]);
  function choose(next: string) { if (value === undefined) setInternal(next); onValueChange?.(next); setOpen(false); }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault(); if (!open) { setOpen(true); requestAnimationFrame(() => document.getElementById(`${id}-option-${selected}`)?.focus()); return; }
      const direction = event.key === "ArrowDown" ? 1 : -1; const next = (selected + direction + options.length) % options.length;
      document.getElementById(`${id}-option-${next}`)?.focus();
    } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!open) { setOpen(true); requestAnimationFrame(() => document.getElementById(`${id}-option-${selected}`)?.focus()); } else setOpen(false); }
    else if (event.key === "Escape") setOpen(false);
  }
  function optionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const next = (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length; document.getElementById(`${id}-option-${next}`)?.focus(); }
    else if (event.key === "Escape") { setOpen(false); document.getElementById(id)?.focus(); }
    else if (event.key === "Tab") setOpen(false);
  }
  return <div className={`themed-select ${className}${open ? " is-open" : ""}`} ref={root} onBlur={(event) => { const next = event.relatedTarget as Node | null; if (next && !root.current?.contains(next) && !menu.current?.contains(next)) setOpen(false); }}>
    {label && <span className="themed-select-label">{label}</span>}
    <button id={id} type="button" className="themed-select-trigger" role="combobox" aria-controls={`${id}-listbox`} aria-expanded={open} aria-haspopup="listbox" aria-label={label} disabled={disabled} onClick={() => setOpen((state) => !state)} onKeyDown={keyDown}>
      <span>{options.find((option) => option.value === current)?.label ?? options[0]?.label ?? "Choose"}</span><i className={open ? "select-chevron is-open" : "select-chevron"} aria-hidden="true" />
    </button>
    {name && <input type="hidden" name={name} value={current} />}
    {open && menuStyle && createPortal(<div ref={menu} className="themed-select-menu" style={menuStyle} id={`${id}-listbox`} role="listbox">{options.map((option, index) => <button id={`${id}-option-${index}`} key={option.value} type="button" role="option" aria-selected={current === option.value} className={current === option.value ? "themed-select-option selected" : "themed-select-option"} onClick={() => choose(option.value)} onKeyDown={(event) => optionKeyDown(event, index)}>{option.label}{current === option.value && <span aria-hidden="true">✓</span>}</button>)}</div>, document.body)}
  </div>;
}
