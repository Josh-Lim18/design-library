async function request(url, options) {
  const res = await fetch(url, options);
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const api = {
  listItems({ tags = [], mode = 'or', q = '' } = {}) {
    const params = new URLSearchParams();
    if (tags.length) params.set('tags', tags.join(','));
    if (mode === 'and') params.set('mode', 'and');
    if (q) params.set('q', q);
    const qs = params.toString();
    return request(`/api/items${qs ? `?${qs}` : ''}`);
  },

  getItem(id) {
    return request(`/api/items/${id}`);
  },

  createFromUpload(formData) {
    return request('/api/items', { method: 'POST', body: formData });
  },

  createFromUrl(payload) {
    return request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  updateItem(id, patch) {
    return request(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  },

  deleteItem(id) {
    return request(`/api/items/${id}`, { method: 'DELETE' });
  },

  fetchPreview(url) {
    return request('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  },

  listTags() {
    return request('/api/tags');
  },

  renameTag(id, name) {
    return request(`/api/tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  },

  mergeTag(id, intoId) {
    return request(`/api/tags/${id}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intoId }),
    });
  },

  deleteTag(id) {
    return request(`/api/tags/${id}`, { method: 'DELETE' });
  },
};
