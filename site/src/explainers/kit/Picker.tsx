/** ModelPicker for explainers (DESIGN §5): computed presets as a segmented control plus one select per slot. */
import type { Bundle, Model } from "../../data/types";
import { familiesOf, ladder, STAGE_CODE } from "../../data/derive";
import { Glyph } from "../../components/Glyph";

export interface Slot {
  key: string;
  label: string;
  value: string | null;
  onChange: (id: string) => void;
  hollow?: boolean;
  /** stage of the current value, for the glyph */
  model?: Model | null;
}

export interface Preset {
  label: string;
  ids: (string | null)[];
  onSelect: () => void;
}

export function ModelPicker({
  bundle,
  slots,
  presets = [],
  eligible,
  note,
  extra,
}: {
  bundle: Bundle;
  slots: Slot[];
  presets?: Preset[];
  eligible: (m: Model) => boolean;
  note?: string;
  extra?: React.ReactNode;
}) {
  const fams = familiesOf(bundle);
  const current = slots.map((s) => s.value);
  return (
    <div className="xp-picker">
      {presets.length > 0 && (
        <div className="seg xp-presets" role="group" aria-label="Computed specimens">
          {presets.map((p) => {
            const on = p.ids.length === current.length && p.ids.every((id, i) => id === current[i]);
            return (
              <button key={p.label} type="button" className="btn" aria-pressed={on} onClick={p.onSelect}>
                {p.label}
              </button>
            );
          })}
        </div>
      )}
      {slots.map((s) => (
        <label className="xp-slot" key={s.key}>
          <span className="xp-slot-label">
            {s.model && <Glyph stage={s.model.stage} hollow={s.hollow} size={8} />} {s.label}
          </span>
          <select value={s.value ?? ""} onChange={(e) => s.onChange(e.target.value)} aria-label={`${s.label}: any model`}>
            {s.value === null && <option value="">—</option>}
            {fams.map((f) => {
              const rungs = ladder(bundle, f).filter(eligible);
              if (!rungs.length) return null;
              return (
                <optgroup key={f} label={f}>
                  {rungs.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} · {STAGE_CODE[m.stage]}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
      ))}
      {extra}
      {note && <p className="small ink3 xp-picker-note">{note}</p>}
    </div>
  );
}
