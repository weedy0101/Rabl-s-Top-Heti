// Memóriában működő, hamis tároló a Netlify Blobs helyett (csak teszteléshez).
export function createFakeStore() {
  const data = new Map();
  return {
    async setJSON(key, value) {
      data.set(key, JSON.stringify(value));
    },
    async get(key, opts = {}) {
      const raw = data.get(key);
      if (raw === undefined) return null;
      return opts.type === 'json' ? JSON.parse(raw) : raw;
    },
    async list() {
      return { blobs: [...data.keys()].map((key) => ({ key, etag: '"x"' })), directories: [] };
    },
    async delete(key) {
      data.delete(key);
    },
    _size: () => data.size,
  };
}
