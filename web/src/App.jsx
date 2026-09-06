import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useSearchParams, Link } from 'react-router-dom';
import { api } from './api.js';
import TagSidebar from './components/TagSidebar.jsx';
import SectionSidebar from './components/SectionSidebar.jsx';
import AddItemDialog from './components/AddItemDialog.jsx';
import TagManager from './components/TagManager.jsx';

export default function App() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const onGallery = location.pathname === '/';

  const [tags, setTags] = useState([]);
  const [sections, setSections] = useState([]);
  const [styles, setStyles] = useState([]);
  const [aiTagging, setAiTagging] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [showManager, setShowManager] = useState(false);

  const reloadFacets = useCallback(() => {
    api.listTags().then(setTags).catch(() => {});
    api.listSections().then(setSections).catch(() => {});
    api.listStyles().then(setStyles).catch(() => {});
  }, []);

  const bump = useCallback(() => {
    reloadFacets();
    setReloadKey((k) => k + 1);
  }, [reloadFacets]);

  useEffect(() => {
    reloadFacets();
    api
      .health()
      .then((h) => setAiTagging(Boolean(h?.aiTagging)))
      .catch(() => setAiTagging(false));
  }, [reloadFacets]);

  const activeTags = (searchParams.get('tags') || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const activeSection = searchParams.get('section') || '';
  const activeStyle = searchParams.get('style') || '';

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

  function toggleSection(value) {
    setParam('section', activeSection === value ? '' : value);
  }

  function toggleStyle(value) {
    setParam('style', activeStyle === value ? '' : value);
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
        <SectionSidebar
          sections={sections}
          activeSection={activeSection}
          onToggle={toggleSection}
        />
        <TagSidebar
          tags={tags}
          activeTags={activeTags}
          onToggle={toggleTag}
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

        <Outlet
          context={{
            tags,
            sections,
            styles,
            aiTagging,
            reloadKey,
            bump,
            activeTags,
            activeSection,
            activeStyle,
            toggleTag,
            toggleSection,
            toggleStyle,
            setParam,
          }}
        />
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
      {showManager && <TagManager onClose={() => setShowManager(false)} onChanged={bump} />}
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
