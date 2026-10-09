import { useEffect, useId, useRef, useState } from 'react';
import { templates, type CardMode, type TemplateDefinition } from '../../config/templates';
import { S } from '../../lib/i18n/strings';
import { Icon } from './Icon';

const GROUPS: readonly CardMode[] = ['article', 'custom'];

/**
 * Custom-styled template dropdown (WAI-ARIA select-only combobox): a button that
 * opens a grouped listbox. Keyboard: Enter/Space/↓ open; ↑↓ Home End move;
 * Enter/Space pick; Esc/Tab close; typing a letter jumps to a matching template.
 */
export function TemplatePicker(props: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ordered = GROUPS.flatMap((mode) => templates.filter((t) => t.mode === mode));
  const selectedIndex = Math.max(0, ordered.findIndex((t) => t.id === props.value));
  const [active, setActive] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const optionId = (i: number) => `${baseId}-opt-${i}`;
  const selected = ordered[selectedIndex]!;

  useEffect(() => {
    if (!open) return;
    setActive(selectedIndex);
    listRef.current?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
    // selectedIndex only matters at open time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  const choose = (i: number) => {
    const t = ordered[i];
    if (t) props.onChange(t.id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const name = (t: TemplateDefinition) => S.templates[t.id] ?? t.label;

  return (
    <div className="picker" ref={rootRef}>
      <span className="field-label" id={`${baseId}-label`}>
        {S.picker.label}
      </span>
      <button
        ref={buttonRef}
        type="button"
        className="picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${baseId}-label ${baseId}-value`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <img className="picker-thumb" src={selected.thumbnail} alt="" />
        <span className="picker-text" id={`${baseId}-value`}>
          <span className="picker-name">{name(selected)}</span>
          <span className={`mode-badge mode-${selected.mode}`}>{S.modes[selected.mode].badge}</span>
        </span>
        <span className="picker-chevron" data-open={open}>
          <Icon name="chevron" />
        </span>
      </button>
      {open && (
        <ul
          ref={listRef}
          className="picker-list"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${baseId}-label`}
          aria-activedescendant={optionId(active)}
          onKeyDown={(e) => {
            const last = ordered.length - 1;
            if (e.key === 'ArrowDown') setActive((a) => Math.min(last, a + 1));
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
            else if (e.key === 'Home') setActive(0);
            else if (e.key === 'End') setActive(last);
            else if (e.key === 'Enter' || e.key === ' ') choose(active);
            else if (e.key === 'Escape') {
              setOpen(false);
              buttonRef.current?.focus();
            } else if (e.key === 'Tab') {
              setOpen(false);
              return;
            } else if (e.key.length === 1 && /\S/.test(e.key)) {
              const from = active + 1;
              const hit = [...ordered.slice(from), ...ordered.slice(0, from)].find((t) =>
                name(t).toLowerCase().startsWith(e.key.toLowerCase()),
              );
              if (hit) setActive(ordered.indexOf(hit));
            } else return;
            e.preventDefault();
          }}
        >
          {GROUPS.map((mode) => (
            <li key={mode} role="presentation">
              <ul role="group" aria-labelledby={`${baseId}-group-${mode}`}>
                <li role="presentation" className="picker-group" id={`${baseId}-group-${mode}`}>
                  {S.modes[mode].label}
                  <span className="picker-group-hint">{S.modes[mode].hint}</span>
                </li>
                {ordered.map((t, i) =>
                  t.mode !== mode ? null : (
                    <li
                      key={t.id}
                      id={optionId(i)}
                      role="option"
                      aria-selected={t.id === props.value}
                      className={`picker-option${i === active ? ' active' : ''}`}
                      onPointerMove={() => setActive(i)}
                      onClick={() => choose(i)}
                    >
                      <img className="picker-thumb" src={t.thumbnail} alt="" loading="lazy" />
                      <span className="picker-name">{name(t)}</span>
                      <span className={`mode-badge mode-${t.mode}`}>{S.modes[t.mode].badge}</span>
                      {t.id === props.value && (
                        <span className="picker-check">
                          <Icon name="check" size={18} />
                        </span>
                      )}
                    </li>
                  ),
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
