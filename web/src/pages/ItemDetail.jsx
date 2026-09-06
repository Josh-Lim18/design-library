import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../api.js';
import TagInput from '../components/TagInput.jsx';

export default function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tags: allTags, bump } = useOutletContext();

  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ description: '', source_url: '', tags: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setItem(null);
    setEditing(false);
    api.getItem(id).then(setItem).catch((e) => setError(e.message));
  }, [id]);

  function startEdit() {
    setForm({
      description: item.description || '',
      source_url: item.source_url || '',
      tags: item.tags,
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api.updateItem(id, {
        description: form.description,
        source_url: form.source_url,
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

  async function remove() {
    if (!window.confirm('Delete this reference permanently?')) return;
    await api.deleteItem(id);
    bump();
    navigate('/');
  }

  if (error) {
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
                <div className="field-label">Tags</div>
                {item.tags.length ? (
                  <div className="tags">
                    {item.tags.map((t) => (
                      <Link key={t} to={`/?tags=${encodeURIComponent(t)}`}>
                        {t}
                      </Link>
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
