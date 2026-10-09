const DEFAULT_API_BASE = 'http://localhost:3001/api';

const input = document.getElementById('apiBase');
const status = document.getElementById('status');

async function load() {
  const { apiBase } = await chrome.storage.local.get(['apiBase']);
  input.value = apiBase || DEFAULT_API_BASE;
}

document.getElementById('save').addEventListener('click', async () => {
  const value = input.value.trim().replace(/\/$/, '');
  if (!value) return;
  await chrome.storage.local.set({ apiBase: value });
  status.textContent = 'Saved.';
  setTimeout(() => (status.textContent = ''), 2000);
});

load();
