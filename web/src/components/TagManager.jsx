import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';

export default function TagManager({ onClose, onChanged }) {
  const [tags, setTags] = useState([]);
  const [editing, setEditing] = useState(null); // tag id
  const [draft, setDraft] = useState('');
  const [merging, setMerging] = useState(null); // tag id
  const [mergeInto, setMergeInto] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    return api.listTags().then(setTags).catch((e) => setError(e.message));
  }
  useEffect(() => {
    reload();
  }, []);

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const startRename = (tag) => {
    setEditing(tag.id);
    setDraft(tag.name);
    setMerging(null);
  };
  const startMerge = (tag) => {
    setMerging(tag.id);
    setMergeInto('');
    setEditing(null);
  };

  return (
    <Modal title="Manage tags" onClose={onClose}>
      <div className="body">
        {tags.length === 0 && <p className="hint">No tags yet.</p>}

        <div className="manager-list">
          {tags.map((tag) => (
            <div className="manager-row" key={tag.id}>
              <div className="name">
                {editing === tag.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter')
                        run(() => api.renameTag(tag.id, draft)).then(() => setEditing(null));
                      if (e.key === 'Escape') setEditing(null);
                    }}
                  />
                ) : (
                  tag.name
                )}
              </div>
              <span className="count">{tag.count}</span>

              {merging === tag.id ? (
                <>
                  <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
                    <option value="">merge into…</option>
                    {tags
                      .filter((t) => t.id !== tag.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                  <button
                    className="btn btn--sm"
                    disabled={!mergeInto || busy}
                    onClick={() =>
                      run(() => api.mergeTag(tag.id, Number(mergeInto))).then(() => setMerging(null))
                    }
                  >
                    Merge
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => setMerging(null)}>
                    Cancel
                  </button>
                </>
              ) : editing === tag.id ? (
                <>
                  <button
                    className="btn btn--sm"
                    disabled={busy}
                    onClick={() => run(() => api.renameTag(tag.id, draft)).then(() => setEditing(null))}
                  >
                    Save
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <div className="row-actions">
                  <button className="icon-btn" title="Rename" onClick={() => startRename(tag)}>
                    <PencilIcon />
                  </button>
                  <button
                    className="icon-btn"
                    title="Merge into another tag"
                    disabled={tags.length < 2}
                    onClick={() => startMerge(tag)}
                  >
                    <MergeIcon />
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Delete tag"
                    onClick={() => {
                      if (window.confirm(`Delete the tag “${tag.name}”? It will be removed from ${tag.count} item(s).`))
                        run(() => api.deleteTag(tag.id));
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {error && <p className="form-error">{error}</p>}
      </div>

      <div className="footer">
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
    </svg>
  );
}
function MergeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3v6a6 6 0 0 0 6 6h6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m15 12 3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
