import { useEffect, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import MasonryGrid from '../components/MasonryGrid.jsx';
import { sectionLabel } from '../sections.js';
import { STYLE_ORDER, styleLabel } from '../aesthetics.js';

export default function Gallery() {
  const { styles, reloadKey, activeTags, activeSection, activeStyle, toggleStyle, setParam } =
    useOutletContext();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'and' ? 'and' : 'or';
  const q = searchParams.get('q') || '';

  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const debouncedQ = useDebounced(q, 250);
  const tagsKey = activeTags.join(',').toLowerCase();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .listItems({ tags: activeTags, mode, q: debouncedQ, section: activeSection, style: activeStyle })
      .then((data) => !cancelled && setItems(data))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagsKey, mode, debouncedQ, activeSection, activeStyle, reloadKey]);

  const styleChips = [...styles].sort(
    (a, b) => STYLE_ORDER.indexOf(a.value) - STYLE_ORDER.indexOf(b.value)
  );
  const filtering =
    activeTags.length > 0 || q.trim().length > 0 || Boolean(activeSection) || Boolean(activeStyle);

  return (
    <>
      {styleChips.length > 0 && (
        <div className="stylebar">
          <span className="stylebar-label">Aesthetic</span>
          {styleChips.map((s) => (
            <button
              key={s.value}
              className={`style-chip${activeStyle === s.value ? ' is-on' : ''}`}
              onClick={() => toggleStyle(s.value)}
            >
              {styleLabel(s.value)}
              <span className="c">{s.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="filterbar">
        <span className="lead">
          {items ? `${items.length} ${items.length === 1 ? 'reference' : 'references'}` : 'Loading'}
        </span>

        {activeStyle && (
          <span className="chip">
            {styleLabel(activeStyle)}
            <button aria-label="Remove aesthetic filter" onClick={() => setParam('style', '')}>
              ×
            </button>
          </span>
        )}

        {activeSection && (
          <span className="chip">
            {sectionLabel(activeSection)}
            <button aria-label="Remove section filter" onClick={() => setParam('section', '')}>
              ×
            </button>
          </span>
        )}

        {activeTags.map((tag) => (
          <span key={tag} className="chip">
            {tag}
            <button
              aria-label={`Remove ${tag} filter`}
              onClick={() =>
                setParam(
                  'tags',
                  activeTags.filter((t) => t.toLowerCase() !== tag.toLowerCase()).join(',')
                )
              }
            >
              ×
            </button>
          </span>
        ))}

        {activeTags.length >= 2 && (
          <div className="mode-toggle" role="group" aria-label="Match mode">
            <button className={mode === 'or' ? 'is-on' : ''} onClick={() => setParam('mode', '')}>
              Any
            </button>
            <button className={mode === 'and' ? 'is-on' : ''} onClick={() => setParam('mode', 'and')}>
              All
            </button>
          </div>
        )}

        {filtering && (
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setParam('tags', '');
              setParam('q', '');
              setParam('mode', '');
              setParam('section', '');
              setParam('style', '');
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="gallery">
        {error && (
          <div className="state">
            <h3>Couldn’t load references</h3>
            <p>{error}</p>
          </div>
        )}
        {!error && items === null && <div className="spinner" />}
        {!error && items && items.length === 0 && (
          <div className="state">
            <h3>{filtering ? 'Nothing matches these filters' : 'Your library is empty'}</h3>
            <p>
              {filtering
                ? 'Try removing a filter or clearing the search.'
                : 'Add your first reference with the button up top.'}
            </p>
          </div>
        )}
        {!error && items && items.length > 0 && <MasonryGrid items={items} />}
      </div>
    </>
  );
}

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  const timer = useRef();
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setV(value), ms);
    return () => clearTimeout(timer.current);
  }, [value, ms]);
  return v;
}
