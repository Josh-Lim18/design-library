import { useState } from 'react';

export default function TagInput({ value, onChange, suggestions = [], placeholder = 'Add a tag…' }) {
  const [draft, setDraft] = useState('');
  const selected = new Set(value.map((t) => t.toLowerCase()));

  function add(name) {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean || selected.has(clean.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...value, clean]);
    setDraft('');
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  const matches = suggestions
    .filter((s) => !selected.has(s.toLowerCase()))
    .filter((s) => (draft ? s.toLowerCase().includes(draft.toLowerCase()) : true))
    .slice(0, 12);

  return (
    <div>
      <div className="taginput" onClick={(e) => e.currentTarget.querySelector('input')?.focus()}>
        {value.map((tag) => (
          <span key={tag} className="tag-token">
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))}>
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          placeholder={value.length ? '' : placeholder}
        />
      </div>
      {matches.length > 0 && (
        <div className="suggestions">
          {matches.map((s) => (
            <button
              type="button"
              key={s}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
