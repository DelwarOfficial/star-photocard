import type { ReactNode } from 'react';
import { S, type LayerKey } from '../../lib/i18n/strings';
import { Icon, type IconName } from './Icon';

/** Range input with a brand-coloured fill and a live value bubble above the thumb. */
export function RangeField(props: {
  id: string;
  label: ReactNode;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
  before?: ReactNode;
  after?: ReactNode;
}) {
  const pct = ((props.value - props.min) / (props.max - props.min)) * 100;
  return (
    <div className="range-field">
      <label htmlFor={props.id}>{props.label}</label>
      <div className="range-row">
        {props.before}
        <div className="range-track" style={{ '--fill': `${pct}%` } as React.CSSProperties}>
          <input
            id={props.id}
            type="range"
            min={props.min}
            max={props.max}
            step={props.step}
            value={props.value}
            aria-valuetext={props.display}
            onChange={(e) => props.onChange(Number(e.target.value))}
          />
          <output className="range-bubble" htmlFor={props.id} aria-hidden="true">
            {props.display}
          </output>
        </div>
        {props.after}
      </div>
    </div>
  );
}

type Cell = { icon: IconName; dx: number; dy: number; dir: string } | 'reset';
const PAD: readonly Cell[] = [
  { icon: 'upLeft', dx: -1, dy: -1, dir: 'up-left' },
  { icon: 'up', dx: 0, dy: -1, dir: 'up' },
  { icon: 'upRight', dx: 1, dy: -1, dir: 'up-right' },
  { icon: 'left', dx: -1, dy: 0, dir: 'left' },
  'reset',
  { icon: 'right', dx: 1, dy: 0, dir: 'right' },
  { icon: 'downLeft', dx: -1, dy: 1, dir: 'down-left' },
  { icon: 'down', dx: 0, dy: 1, dir: 'down' },
  { icon: 'downRight', dx: 1, dy: 1, dir: 'down-right' },
];

/**
 * Layer switcher + 3×3 nudge pad. Each cell moves the selected layer 1 px
 * (Shift: 10 px); the centre resets it. Positions of every layer stay visible.
 */
export function NudgePad(props: {
  layers: readonly LayerKey[];
  selected: LayerKey;
  onSelect: (layer: LayerKey) => void;
  positions: Record<LayerKey, { x: number; y: number }>;
  onNudge: (dx: number, dy: number) => void;
  onReset: () => void;
}) {
  const name = S.layers.names[props.selected];
  return (
    <div className="nudge">
      <div className="segmented" role="radiogroup" aria-label={S.layers.choose}>
        {props.layers.map((layer) => (
          <button
            key={layer}
            type="button"
            role="radio"
            aria-checked={layer === props.selected}
            className="segment"
            onClick={() => props.onSelect(layer)}
          >
            {S.layers.short[layer]}
          </button>
        ))}
      </div>
      <div className="nudge-body">
        <div className="nudge-pad" role="group" aria-label={S.layers.padLabel(name)}>
          {PAD.map((cell, i) =>
            cell === 'reset' ? (
              <button key={i} type="button" className="pad-cell pad-reset" aria-label={S.layers.reset[props.selected]} onClick={props.onReset}>
                <Icon name="reset" size={18} />
              </button>
            ) : (
              <button
                key={i}
                type="button"
                className="pad-cell"
                aria-label={S.layers.move(name, cell.dir)}
                onClick={(e) => props.onNudge(cell.dx * (e.shiftKey ? 10 : 1), cell.dy * (e.shiftKey ? 10 : 1))}
              >
                <Icon name={cell.icon} size={18} />
              </button>
            ),
          )}
        </div>
        <ul className="positions" aria-label={S.layers.positionsLabel}>
          {props.layers.map((layer) => (
            <li key={layer} className={layer === props.selected ? 'current' : undefined}>
              {S.layers.position[layer]}: {Math.round(props.positions[layer].x)}, {Math.round(props.positions[layer].y)} px
            </li>
          ))}
        </ul>
      </div>
      <small>{S.layers.help}</small>
    </div>
  );
}

/** Numbered section heading: brand-yellow step chip + one-line description. */
export function SectionHead(props: { id: string; step: number; title: string; hint: string }) {
  return (
    <legend id={props.id} className="section-head">
      <span className="step-chip" aria-hidden="true">
        {props.step}
      </span>
      <span className="section-title">
        <span className="visually-hidden">{props.step}. </span>
        {props.title}
        <small className="section-hint">{props.hint}</small>
      </span>
    </legend>
  );
}
