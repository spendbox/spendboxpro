"use client";

import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";

export interface ComboOption {
  value: string;
  label: string;
  /** Smaller second line, e.g. a member number. */
  hint?: string;
  /** Extra words that should match a search. */
  keywords?: string;
}

function matches(option: ComboOption, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${option.label} ${option.hint ?? ""} ${option.keywords ?? ""}`.toLowerCase().includes(q);
}

/** Closes a popup when someone taps or clicks outside it. */
function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open, onClose]);
  return ref;
}

/**
 * On phones the keyboard covers the bottom half of the screen. When a list opens,
 * scroll it up to just under the header so the list shows above the keyboard.
 */
function useKeepAboveKeyboard(open: boolean, inline: boolean, ref: RefObject<HTMLDivElement | null>) {
  // How tall the list may be so it ends above the keyboard; null = the normal size.
  const [room, setRoom] = useState<number | null>(null);
  useEffect(() => {
    const touch = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    if (!open || inline || !ref.current || !touch) return;
    const el = ref.current;
    // Instant, not smooth: focusing the search box scrolls too, and would cancel a smooth scroll.
    const bring = () => {
      el.scrollIntoView({ block: "start" });
      const screen = window.visualViewport?.height ?? window.innerHeight;
      setRoom(Math.max(140, Math.floor(screen - el.getBoundingClientRect().top - el.offsetHeight - 24)));
    };
    const first = setTimeout(bring, 60);
    const settle = setTimeout(bring, 350);
    // Again once the keyboard has finished opening (the screen gets shorter).
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", bring);
    const stop = setTimeout(() => viewport?.removeEventListener("resize", bring), 1500);
    return () => {
      clearTimeout(first);
      clearTimeout(settle);
      clearTimeout(stop);
      viewport?.removeEventListener("resize", bring);
      setRoom(null);
    };
  }, [open, inline, ref]);
  return room === null ? undefined : { maxHeight: `min(20rem, ${room}px)` };
}

const panel =
  "absolute inset-x-0 top-full z-50 mt-2 flex max-h-[min(20rem,50dvh)] flex-col overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-line animate-fade-up";
/** Inside a pop-up the list opens in place (pushing content down) so the pop-up's scrolling can't cut it off. */
const inlinePanel = "relative mt-2 flex max-h-64 flex-col overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-line animate-fade-up";

/** True when the element sits inside an open pop-up. */
function inDialog(el: HTMLElement | null) {
  return Boolean(el?.closest("dialog"));
}

function OptionRow({
  option,
  active,
  selected,
  id,
  onPick,
  onHover,
}: {
  option: ComboOption;
  active: boolean;
  selected: boolean;
  id: string;
  onPick: () => void;
  onHover: () => void;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      onPointerDown={(e) => e.preventDefault()}
      onClick={onPick}
      onPointerMove={onHover}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[15px]",
        active ? "bg-brand-50" : "",
        selected ? "font-semibold text-brand-800" : "text-ink",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{option.label}</span>
        {option.hint && <span className="block truncate text-xs font-normal text-muted">{option.hint}</span>}
      </span>
      {selected && <Check className="size-4 shrink-0 text-brand-600" aria-hidden />}
    </li>
  );
}

/**
 * A dropdown that looks the same on every phone and computer, with search for
 * long lists. Works inside forms through `name` (a hidden input).
 */
export function Combobox({
  options,
  value: controlled,
  defaultValue = null,
  onChange,
  name,
  id,
  placeholder = "Choose…",
  searchPlaceholder = "Search",
  searchable,
  disabled,
  emptyText = "No matches",
  className,
  triggerClassName,
  renderValue,
  "aria-label": ariaLabel,
}: {
  options: ComboOption[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  name?: string;
  id?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  emptyText?: string;
  className?: string;
  triggerClassName?: string;
  renderValue?: (option: ComboOption) => ReactNode;
  "aria-label"?: string;
}) {
  const [inner, setInner] = useState<string | null>(defaultValue);
  const value = controlled !== undefined ? controlled : inner;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [inline, setInline] = useState(false);
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const withSearch = searchable ?? options.length > 8;

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const ref = useOutsideClose(open, close);
  const panelStyle = useKeepAboveKeyboard(open, inline, ref);
  const filtered = useMemo(() => options.filter((o) => matches(o, query)), [options, query]);
  const selected = options.find((o) => o.value === value) ?? null;

  function openList() {
    if (disabled) return;
    const index = Math.max(0, options.findIndex((o) => o.value === value));
    setActive(index);
    setInline(inDialog(triggerRef.current));
    setOpen(true);
  }

  function pick(option: ComboOption) {
    if (controlled === undefined) setInner(option.value);
    onChange?.(option.value);
    close();
    triggerRef.current?.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) pick(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      close();
    }
  }

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);

  return (
    <div ref={ref} className={cn("relative scroll-mt-20", className)} onKeyDown={onKey}>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openList())}
        className={cn(
          "flex h-12 w-full items-center gap-2 rounded-xl border border-line-strong bg-white px-3.5 text-left text-[15px] text-ink outline-none transition",
          "focus-visible:border-brand-600 focus-visible:ring-4 focus-visible:ring-brand-600/10 disabled:bg-canvas disabled:text-muted",
          open && "border-brand-600 ring-4 ring-brand-600/10",
          triggerClassName,
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-subtle")}>
          {selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className={inline ? inlinePanel : panel} style={inline ? undefined : panelStyle}>
          {withSearch && (
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search className="size-4 shrink-0 text-muted" aria-hidden />
              <input
                autoFocus
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
                aria-label={searchPlaceholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder={searchPlaceholder}
                className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle focus-visible:outline-none"
              />
            </div>
          )}
          <ul id={listId} role="listbox" className="overflow-y-auto overscroll-contain p-1.5">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted">{emptyText}</li>
            ) : (
              filtered.map((option, i) => (
                <OptionRow
                  key={option.value}
                  id={`${listId}-${i}`}
                  option={option}
                  active={i === active}
                  selected={option.value === value}
                  onPick={() => pick(option)}
                  onHover={() => setActive(i)}
                />
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Pick several values as removable pills, with search and (optionally) your
 * own entries. Sends each value as a hidden input called `name`.
 */
export function MultiCombobox({
  options,
  value: controlled,
  defaultValue = [],
  onChange,
  name,
  id,
  placeholder = "Search or type",
  max = 5,
  allowCustom = true,
  className,
}: {
  options: string[];
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  name?: string;
  id?: string;
  placeholder?: string;
  max?: number;
  allowCustom?: boolean;
  className?: string;
}) {
  const [inner, setInner] = useState<string[]>(defaultValue);
  const value = controlled ?? inner;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputId = useId();
  const focusInput = () => document.getElementById(id ?? inputId)?.focus();
  const ref = useOutsideClose(open, () => setOpen(false));
  const [inline, setInline] = useState(false);
  // Find out once, after mounting, whether this sits inside a pop-up.
  const detect = useCallback((el: HTMLElement | null) => {
    if (el) setInline(inDialog(el));
  }, []);

  const panelStyle = useKeepAboveKeyboard(open, inline, ref);
  const full = value.length >= max;
  const q = query.trim();
  const available = options.filter((o) => !value.includes(o) && o.toLowerCase().includes(q.toLowerCase()));
  const canAddCustom =
    allowCustom && q.length >= 2 && q.length <= 40 && !options.some((o) => o.toLowerCase() === q.toLowerCase()) &&
    !value.some((v) => v.toLowerCase() === q.toLowerCase());
  const rows: { label: string; custom?: boolean }[] = [
    ...available.slice(0, 50).map((label) => ({ label })),
    ...(canAddCustom ? [{ label: q, custom: true }] : []),
  ];

  function set(next: string[]) {
    if (controlled === undefined) setInner(next);
    onChange?.(next);
  }
  function add(label: string) {
    if (full) return;
    set([...value, label]);
    setQuery("");
    setActive(0);
    setOpen(false);
    focusInput();
  }
  function remove(label: string) {
    set(value.filter((v) => v !== label));
    focusInput();
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && rows[active]) add(rows[active].label);
    } else if (e.key === "Backspace" && !query && value.length) {
      remove(value[value.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className={cn("relative scroll-mt-20", className)}>
      {name && value.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      <div
        onClick={() => {
          focusInput();
          setOpen(true);
        }}
        className={cn(
          "flex min-h-12 w-full cursor-text flex-wrap items-center gap-1.5 rounded-xl border border-line-strong bg-white px-2 py-1.5 transition",
          open && "border-brand-600 ring-4 ring-brand-600/10",
        )}
      >
        {value.map((v) => (
          <span key={v} className="inline-flex h-8 items-center gap-1 rounded-full bg-brand-50 pr-1 pl-3 text-sm font-semibold text-brand-800">
            {v}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(v);
              }}
              aria-label={`Remove ${v}`}
              className="flex size-6 items-center justify-center rounded-full hover:bg-brand-100"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ))}
        {!full && (
          <input
            id={id ?? inputId}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined}
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onKeyDown={onKey}
            placeholder={value.length ? "Add more" : placeholder}
            className="h-8 min-w-32 flex-1 bg-transparent px-1.5 text-[15px] outline-none placeholder:text-subtle"
          />
        )}
      </div>
      <p ref={detect} className="mt-1.5 text-sm text-muted">{full ? `That's the maximum of ${max}.` : `Pick up to ${max}.`}</p>

      {open && !full && (
        <div className={inline ? inlinePanel : cn(panel, "top-14 mt-0")} style={inline ? undefined : panelStyle}>
          <ul id={listId} role="listbox" aria-multiselectable className="overflow-y-auto overscroll-contain p-1.5">
            {rows.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted">No matches. Keep typing to add your own.</li>
            ) : (
              rows.map((row, i) => (
                <li
                  key={`${row.custom ? "custom-" : ""}${row.label}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={false}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => add(row.label)}
                  onPointerMove={() => setActive(i)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[15px]",
                    i === active && "bg-brand-50",
                  )}
                >
                  {row.custom ? (
                    <>
                      <Plus className="size-4 text-brand-600" aria-hidden />
                      Add “{row.label}”
                    </>
                  ) : (
                    row.label
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
