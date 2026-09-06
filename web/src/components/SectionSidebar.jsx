import { SECTION_ORDER, sectionLabel } from '../sections.js';

export default function SectionSidebar({ sections, activeSection, onToggle }) {
  if (!sections.length) return null;

  const ordered = [...sections].sort(
    (a, b) => SECTION_ORDER.indexOf(a.value) - SECTION_ORDER.indexOf(b.value)
  );

  return (
    <div className="side-section">
      <h2>Section</h2>
      <div className="tag-list">
        {ordered.map((s) => (
          <button
            key={s.value}
            className={`tag-row${activeSection === s.value ? ' is-active' : ''}`}
            onClick={() => onToggle(s.value)}
          >
            <span className="label">{sectionLabel(s.value)}</span>
            <span className="count">{s.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
