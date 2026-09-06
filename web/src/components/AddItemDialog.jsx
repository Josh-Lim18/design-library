import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import TagInput from './TagInput.jsx';

const DESC_PLACEHOLDER = 'What is this pattern? e.g. "bento grid dashboard layout", "glassmorphic pricing card"';

export default function AddItemDialog({ allTags, onClose, onCreated }) {
  const [tab, setTab] = useState('upload');

  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [preview, setPreview] = useState(null); // { title, imageUrl, siteName }

  const [sourceUrl, setSourceUrl] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const fileInput = useRef(null);
  const suggestions = allTags.map((t) => t.name);

  const [aiTagging, setAiTagging] = useState(false);
  const [analyze, setAnalyze] = useState(true);

  useEffect(() => {
    api
      .health()
      .then((h) => setAiTagging(Boolean(h?.aiTagging)))
      .catch(() => setAiTagging(false));
  }, []);

  useEffect(() => {
    if (!file) return setFilePreview(null);
    const objUrl = URL.createObjectURL(file);
    setFilePreview(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [file]);

  function chooseFile(f) {
    if (!f) return;
    if (!f.type.startsWith('image/')) return setError('That file is not an image.');
    setError(null);
    setFile(f);
  }

  async function runPreview() {
    setError(null);
    setPreview(null);
    if (!/^https?:\/\/.+/i.test(url.trim())) return setError('Enter a full http(s) URL.');
    setFetching(true);
    try {
      const result = await api.fetchPreview(url.trim());
      setPreview(result);
      setSourceUrl(result.url || url.trim());
    } catch (e) {
      setError(e.message);
    } finally {
      setFetching(false);
    }
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      if (tab === 'upload') {
        if (!file) throw new Error('Choose an image to upload.');
        const fd = new FormData();
        fd.append('image', file);
        if (description.trim()) fd.append('description', description.trim());
        if (sourceUrl.trim()) fd.append('source_url', sourceUrl.trim());
        fd.append('tags', JSON.stringify(tags));
        fd.append('analyze', String(aiTagging && analyze));
        await api.createFromUpload(fd);
      } else {
        if (!preview?.imageUrl) {
          throw new Error('No preview image was found. Switch to Upload to add a thumbnail manually.');
        }
        await api.createFromUrl({
          image_url: preview.imageUrl,
          source_url: sourceUrl.trim() || url.trim(),
          description: description.trim(),
          tags,
          analyze: aiTagging && analyze,
        });
      }
      onCreated();
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Add a reference" onClose={onClose} wide>
      <div className="body">
        <div className="tabs" role="tablist">
          <button className={tab === 'upload' ? 'is-on' : ''} onClick={() => setTab('upload')}>
            Upload image
          </button>
          <button className={tab === 'url' ? 'is-on' : ''} onClick={() => setTab('url')}>
            From URL
          </button>
        </div>

        {tab === 'upload' && (
          <>
            <div
              className={`dropzone${dragActive ? ' is-drag' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                chooseFile(e.dataTransfer.files?.[0]);
              }}
              onClick={() => fileInput.current?.click()}
            >
              {file ? (
                <strong>{file.name}</strong>
              ) : (
                <>
                  <strong>Drop an image here</strong> or click to browse
                </>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => chooseFile(e.target.files?.[0])}
              />
            </div>
            {filePreview && (
              <div className="preview-img">
                <img src={filePreview} alt="Selected preview" />
              </div>
            )}
            <label className="control">
              <span>Source URL — optional</span>
              <input
                className="input"
                type="url"
                placeholder="https://…"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </label>
          </>
        )}

        {tab === 'url' && (
          <>
            <label className="control">
              <span>Page URL</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  type="url"
                  placeholder="https://…"
                  value={url}
                  autoFocus
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runPreview()}
                />
                <button className="btn" onClick={runPreview} disabled={fetching}>
                  {fetching ? 'Fetching…' : 'Fetch preview'}
                </button>
              </div>
            </label>

            {preview && (
              <div>
                {preview.title && (
                  <p className="hint" style={{ marginBottom: 8 }}>
                    <strong>{preview.title}</strong>
                    {preview.siteName ? ` — ${preview.siteName}` : ''}
                    {!description && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => setDescription(preview.title)}
                        >
                          use as description
                        </button>
                      </>
                    )}
                  </p>
                )}
                {preview.imageUrl ? (
                  <div className="preview-img">
                    <img src={preview.imageUrl} alt="Fetched preview" />
                  </div>
                ) : (
                  <p className="hint">
                    No preview image found on that page. Switch to <strong>Upload image</strong> to add
                    a thumbnail yourself — the source URL will be kept.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        <label className="control">
          <span>Description — optional</span>
          <textarea
            className="input"
            rows={2}
            placeholder={DESC_PLACEHOLDER}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label className="control">
          <span>Tags</span>
          <TagInput value={tags} onChange={setTags} suggestions={suggestions} />
        </label>

        {aiTagging ? (
          <label className="control control--inline">
            <input type="checkbox" checked={analyze} onChange={(e) => setAnalyze(e.target.checked)} />
            <span>
              Analyze the image and auto-generate tags (typography, aesthetic, colour, layout,
              components) — added alongside anything above. Fills the description if you leave it blank.
            </span>
          </label>
        ) : (
          <p className="hint">
            Set <code>ANTHROPIC_API_KEY</code> — or install the <code>claude</code> CLI (see the
            README) — to auto-generate design tags from the image.
          </p>
        )}

        {error && <p className="form-error">{error}</p>}
      </div>

      <div className="footer">
        <button className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn--primary" onClick={submit} disabled={submitting}>
          {submitting
            ? aiTagging && analyze
              ? 'Analyzing design…'
              : 'Saving…'
            : 'Save reference'}
        </button>
      </div>
    </Modal>
  );
}
