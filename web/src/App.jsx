import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useSearchParams, Link } from 'react-router-dom';
import { api } from './api.js';
import TagSidebar from './components/TagSidebar.jsx';
import AddItemDialog from './components/AddItemDialog.jsx';
import TagManager from './components/TagManager.jsx';

export default function App() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const onGallery = location.pathname === '/';

  const [tags, setTags] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [showManager, setShowManager] = useState(false);

  const reloadTags = useCallback(() => {
    api.listTags().then(setTags).catch(() => {});
  }, []);

  const bump = useCallback(() => {
    reloadTags();
    setReloadKey((k) => k + 1);
  }, [reloadTags]);

  useEffect(() => {
    reloadTags();
  }, [reloadTags]);

  const activeTags = (searchParams.get('tags') || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  // Functional form so several calls in one handler compose instead of clobbering.
  function setParam(key, value) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );
  }

  function toggleTag(name) {
    const set = new Set(activeTags.map((t) => t.toLowerCase()));
    if (set.has(name.toLowerCase())) {
      setParam('tags', activeTags.filter((t) => t.toLowerCase() !== name.toLowerCase()).join(','));
    } else {
      setParam('tags', [...activeTags, name].join(','));
    }
  }

  const q = searchParams.get('q') || '';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Link to="/">
            <h1>Design Library</h1>
          </Link>
        </div>
        <TagSidebar
          tags={tags}
          activeTags={activeTags}
          onToggle={(name) => toggleTag(name)}
          onManage={() => setShowManager(true)}
        />
      </aside>

      <div className="main">
        <header className="header">
          <div className="search" style={{ visibility: onGallery ? 'visible' : 'hidden' }}>
            <SearchIcon />
            <input
              type="search"
              placeholder="Search descriptions and tags…"
              value={q}
              onChange={(e) => setParam('q', e.target.value)}
              aria-label="Search"
            />
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn btn--primary" onClick={() => setShowAdd(true)}>
            <PlusIcon /> Add reference
          </button>
        </header>

        <Outlet context={{ tags, reloadKey, bump, activeTags, setParam }} />
      </div>

      {showAdd && (
        <AddItemDialog
          allTags={tags}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            bump();
          }}
        />
      )}
      {showManager && (
        <TagManager
          onClose={() => setShowManager(false)}
          onChanged={bump}
        />
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}
