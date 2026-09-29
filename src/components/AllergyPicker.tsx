// Allergies, on onboarding's "Your food" and in Account → Diet & allergies: the allergens the person's country makes
// labels list (minus what their diet already rules out) as chips to tap, plus anything else they type in, shown as
// chips with a remove button (src/lib/allergens.ts).
import { useState } from 'react';
import { addTyped, allergenChoices, allergyName, customAllergies, MAX_TYPED } from '../lib/allergens';
import { allergenLabel } from '../lib/countries';
import type { Diet } from '../lib/diet';
import { CloseIcon } from './Icons';

interface AllergyPickerProps {
  countryAllergens: string[];
  diet: Diet | null | undefined;
  selected: string[];
  onChange: (next: string[]) => void;
  /** a short confirmation for the app's message pill */
  onMessage?: (tone: 'success' | 'info' | 'warn', text: string) => void;
}

const nameOf = (a: string) => allergyName(a, id => allergenLabel(id));

export default function AllergyPicker({ countryAllergens, diet, selected, onChange, onMessage }: AllergyPickerProps) {
  const [text, setText] = useState('');
  const choices = allergenChoices(countryAllergens, diet, selected);
  const typed = customAllergies(selected);
  const toggle = (a: string) => onChange(selected.includes(a) ? selected.filter(x => x !== a) : [...selected, a]);
  // what the diet left off the list (ones already picked stay on it, so they can be taken off)
  const left = (ids: string[]) => ids.some(a => countryAllergens.includes(a)) && !ids.some(a => choices.includes(a));
  const hidden = [left(['fish']) && 'fish', left(['crustaceans', 'molluscs']) && 'shellfish', left(['eggs']) && 'eggs'].filter((x): x is string => !!x);
  const hiddenNote = hidden.length
    ? `${[hidden.slice(0, -1).join(', '), hidden[hidden.length - 1]].filter(Boolean).join(' and ').replace(/^./, c => c.toUpperCase())} aren’t listed — you don’t eat them.`
    : null;

  const add = () => {
    if (!text.trim()) return;
    const { next, added, full } = addTyped(selected, text);
    if (added.length) {
      onChange(next);
      onMessage?.('success', `Added ${added.map(nameOf).join(', ')}`);
    } else {
      onMessage?.(full ? 'warn' : 'info', full ? `You can add up to ${MAX_TYPED} of your own.` : 'That’s already on your list.');
    }
    setText('');
  };

  return (
    <div className="kx-allergies">
      <div className="kx-chip-wrap">
        {choices.map(a => {
          const on = selected.includes(a);
          return (
            <button key={a} type="button" onClick={() => toggle(a)} className={`kx-chip ${on ? 'kx-chip-on' : ''}`} aria-pressed={on}>
              {allergenLabel(a)}
            </button>
          );
        })}
        {typed.map(a => (
          <button key={a} type="button" onClick={() => toggle(a)} className="kx-chip kx-chip-on kx-chip-typed" aria-label={`Remove ${nameOf(a)}`}>
            {nameOf(a)}<CloseIcon size={14} />
          </button>
        ))}
      </div>
      <form className="kx-search kx-allergy-add" onSubmit={e => { e.preventDefault(); add(); }}>
        <input
          className="kx-search-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Something else? e.g. kiwi"
          aria-label="Add another allergy"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="done"
          maxLength={80}
        />
        {text.trim() && <button type="submit" className="kx-search-go">Add</button>}
      </form>
      {hiddenNote && <p className="kx-allergy-hint">{hiddenNote}</p>}
    </div>
  );
}
