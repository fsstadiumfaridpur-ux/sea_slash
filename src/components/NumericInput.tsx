import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { type?: 'number' };

// Keep the typed string until blur so parent numeric state cannot erase a decimal or empty draft.
export function NumericInput({ value, step = 'any', onChange, onFocus, onBlur, placeholder = '0', required, min, ...props }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const display = value === 0 || value == null ? '' : String(value);
  return <input {...props} type="number" inputMode={step === 1 || step === '1' ? 'numeric' : 'decimal'} min={min} step={step}
    placeholder={placeholder} required={required && !(Number(value) === 0 && Number(min ?? 0) <= 0)} value={editing ? draft : display}
    onFocus={event => { setDraft(display); setEditing(true); onFocus?.(event); }}
    onChange={event => { setDraft(event.target.value); onChange?.(event); }}
    onBlur={event => { setEditing(false); onBlur?.(event); }} />;
}
