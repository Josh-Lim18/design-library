import { useMemo } from 'react';
import { groupByCategory } from '../categories.js';

export default function TagSidebar({ tags, activeTags, onToggle, onManage }) {
  const active = new Set(activeTags.map((t) => t.toLowerCase()));
  const groups = useMemo(() => groupByCategory(tags), [tags]);

  return (
    <div className="side-section">
      <h2>
        Tags
        {tags.length > 0 && <button onClick={onManage}>Manage</button>}
      </h2>
      <div className="tag-list">
        {tags.length === 0 && <div className="tag-empty">No tags yet</div>}
        {groups.map((group) => (
          <div className="tag-group" key={group.category}>
            {groups.length > 1 && <div className="tag-group-label">{group.label}</div>}
            {group.tags.map((tag) => (
              <button
                key={tag.id}
                className={`tag-row${active.has(tag.name.toLowerCase()) ? ' is-active' : ''}`}
                onClick={() => onToggle(tag.name)}
              >
                <span className="label">{tag.name}</span>
                <span className="count">{tag.count}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
