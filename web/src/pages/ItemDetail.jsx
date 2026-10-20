import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../api.js';
import TagInput from '../components/TagInput.jsx';
import { groupByCategory } from '../categories.js';
import { SECTION_ORDER, sectionLabel } from '../sections.js';
import { STYLE_ORDER, styleLabel } from '../aesthetics.js';

export default function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tags: allTags, bump, aiTagging } = useOutletContext();

  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    description: '',
    source_url: '',
    section: '',
    style: '',
    tags: [],
  });
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  useEffect(() => {
    setItem(null);
    setEditing(false);
    setError(null);
    api.getItem(id).then(setItem).catch((e) => setError(e.message));
  }, [id]);

  function startEdit() {
    setForm({
      description: item.description || '',
      source_url: item.source_url || '',
      section: item.section || '',
      style: item.style || '',
      tags: item.tags,
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateItem(id, {
        description: form.description,
        source_url: form.source_url,
        section: form.section,
        style: form.style,
        tags: form.tags,
      });
      setItem(updated);
      setEditing(false);
      bump();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function reanalyze() {
    setReanalyzing(true);
    setError(null);
    try {
      const updated = await api.reanalyzeItem(id);
      setItem(updated);
      bump();
    } catch (e) {
      setError(e.message);
    } finally {
      setReanalyzing(false);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this reference permanently?')) return;
    await api.deleteItem(id);
    bump();
    navigate('/');
  }

  const categoryByName = useMemo(
    () => new Map(allTags.map((t) => [t.name.toLowerCase(), t.category])),
    [allTags]
  );
  const tagGroups = useMemo(
    () =>
      item
        ? groupByCategory(
            item.tags.map((name) => ({ name })),
            (t) => categoryByName.get(t.name.toLowerCase())
          )
        : [],
    [item, categoryByName]
  );

  if (error && !item) {
    return (
      <div className="detail">
        <Link to="/" className="back">
          ← Back to library
        </Link>
        <div className="state">
          <h3>Couldn’t load this reference</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }
  if (!item) return <div className="spinner" />;

  const created = new Date(item.created_at.replace(' ', 'T') + 'Z');

  return (
    <div className="detail">
      <Link to="/" className="back">
        ← Back to library
      </Link>

      <div className="detail-grid">
        <figure>
          <img src={`/uploads/${item.image_path}`} alt={item.description || 'Design reference'} />
        </figure>

        <aside>
          {error && <p className="form-error">{error}</p>}
          {editing ? (
            <>
              <div>
                <div className="field-label">Description</div>
                <textarea
                  className="input"
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <div className="field-label">Aesthetic</div>
                <select
                  className="input"
                  value={form.style}
                  onChange={(e) => setForm({ ...form, style: e.target.value })}
                >
                  <option value="">— none —</option>
                  {STYLE_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {styleLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="field-label">Section</div>
                <select
                  className="input"
                  value={form.section}
                  onChange={(e) => setForm({ ...form, section: e.target.value })}
                >
                  <option value="">— none —</option>
                  {SECTION_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {sectionLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="field-label">Tags</div>
                <TagInput
                  value={form.tags}
                  onChange={(t) => setForm({ ...form, tags: t })}
                  suggestions={allTags.map((t) => t.name)}
                />
              </div>
              <div>
                <div className="field-label">Source URL</div>
                <input
                  className="input"
                  type="url"
                  value={form.source_url}
                  onChange={(e) => setForm({ ...form, source_url: e.target.value })}
                />
              </div>
              <div className="detail-actions">
                <button className="btn btn--primary" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button className="btn btn--ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="field-label">Description</div>
                <p className={`desc${item.description ? '' : ' placeholder'}`}>
                  {item.description || 'No description yet.'}
                </p>
              </div>

              <div>
                <div className="field-label">Aesthetic</div>
                {item.style ? (
                  <Link className="section-pill" to={`/?style=${item.style}`}>
                    {styleLabel(item.style)}
                  </Link>
                ) : (
                  <p className="desc placeholder">Not set</p>
                )}
              </div>

              <div>
                <div className="field-label">Section</div>
                {item.section ? (
                  <Link className="section-pill" to={`/?section=${item.section}`}>
                    {sectionLabel(item.section)}
                  </Link>
                ) : (
                  <p className="desc placeholder">Not set</p>
                )}
              </div>

              <div>
                <div className="field-label">Tags</div>
                {item.tags.length ? (
                  <div className="tag-cats">
                    {tagGroups.map((group) => (
                      <div className="tag-cat" key={group.category}>
                        {tagGroups.length > 1 && (
                          <div className="tag-cat-label">{group.label}</div>
                        )}
                        <div className="tags">
                          {group.tags.map((t) => (
                            <Link key={t.name} to={`/?tags=${encodeURIComponent(t.name)}`}>
                              {t.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="desc placeholder">Untagged</p>
                )}
              </div>

              {item.source_url && (
                <div>
                  <div className="field-label">Source</div>
                  <a className="source" href={item.source_url} target="_blank" rel="noreferrer">
                    {item.source_url}
                  </a>
                </div>
              )}

              <div>
                <div className="field-label">Added</div>
                <p className="meta">
                  {created.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>

              <div className="detail-actions">
                <button className="btn" onClick={startEdit}>
                  Edit
                </button>
                {aiTagging && (
                  <button className="btn" onClick={reanalyze} disabled={reanalyzing}>
                    {reanalyzing ? 'Re-analyzing…' : 'Re-analyze'}
                  </button>
                )}
                <button className="btn btn--danger" onClick={remove}>
                  Delete
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
