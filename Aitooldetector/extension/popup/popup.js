// Extension popup script
const DEFAULT_API_BASE = 'http://localhost:3001/api';

async function getApiBase() {
  const { apiBase } = await chrome.storage.local.get(['apiBase']);
  return apiBase || DEFAULT_API_BASE;
}

function detectBrowserName() {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Brave')) return 'Brave';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Chrome')) return 'Chrome';
  return 'Browser';
}

function renderSignedOut(content, statusBar, statusDot, statusText, errorMsg) {
  statusBar.className = 'status-bar inactive';
  statusDot.className = 'dot inactive';
  statusText.className = 'status-text inactive';
  statusText.textContent = 'Not signed in';

  content.innerHTML = `
    <form id="signin-form" class="signin-form">
      <label for="sapId">SAP ID</label>
      <input id="sapId" type="text" autocomplete="username" required />
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" required />
      <button id="signin-btn" type="submit">Sign In</button>
      <div id="signin-error" class="signin-error">${errorMsg || ''}</div>
      <div class="signin-hint">
        Use the same SAP ID and password you used to sign up on the Student Dashboard.
      </div>
    </form>
  `;

  if (errorMsg) {
    document.getElementById('signin-error').style.display = 'block';
  }

  document.getElementById('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('signin-btn');
    const errorEl = document.getElementById('signin-error');
    const sapId = document.getElementById('sapId').value.trim();
    const password = document.getElementById('password').value;

    btn.disabled = true;
    btn.textContent = 'Signing in...';
    errorEl.style.display = 'none';

    try {
      const apiBase = await getApiBase();

      // Step 1: sign in with SAP ID + password
      const signinRes = await fetch(`${apiBase}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sapId, password }),
      });
      const signinData = await signinRes.json();

      if (!signinRes.ok) {
        throw new Error(signinData.error || 'Sign-in failed. Check your SAP ID and password.');
      }

      const { accessToken, refreshToken, student } = signinData;

      // Step 2: register this browser as its own lightweight "device"
      // so usage events can be linked to it, same as the desktop app does.
      const hostname = `Browser: ${detectBrowserName()} (${sapId})`;
      const activateRes = await fetch(`${apiBase}/device/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          hostname,
          osType: 'UNKNOWN',
          appVersion: 'extension-1.0.0',
        }),
      });
      const activateData = await activateRes.json();

      if (!activateRes.ok) {
        throw new Error(activateData.error || 'Could not register this browser as a device.');
      }

      await chrome.storage.local.set({
        accessToken,
        refreshToken,
        deviceId: activateData.deviceId,
        deviceToken: activateData.deviceToken,
        studentInfo: student,
      });

      // Kick off an immediate tool sync so the popup has fresh data right away.
      chrome.runtime.sendMessage({ type: 'sync-tools' }).catch(() => { });

      window.location.reload();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Sign In';
      errorEl.textContent = err.message || 'Something went wrong. Please try again.';
      errorEl.style.display = 'block';
    }
  });
}

function renderSignedIn(content, statusBar, statusDot, statusText, stored) {
  statusBar.className = 'status-bar';
  statusDot.className = 'dot';
  statusText.className = 'status-text';
  statusText.textContent = 'Monitoring Active';

  const student = stored.studentInfo || {};
  const syncedTools = stored.syncedTools || [];

  content.innerHTML = `
    <div class="section">
      <div class="section-label">Student</div>
      <div class="row">
        <span class="row-label">Name</span>
        <span class="row-value">${student.name || '—'}</span>
      </div>
      <div class="row">
        <span class="row-label">SAP ID</span>
        <span class="row-value">${student.sapId || '—'}</span>
      </div>
      <div class="row">
        <span class="row-label">Branch</span>
        <span class="row-value">${student.branch || '—'}</span>
      </div>
    </div>
    <div class="section">
      <div class="section-label">Monitoring</div>
      <div class="row">
        <span class="row-label">Synced tools</span>
        <span class="row-value">${syncedTools.length}</span>
      </div>
      <div class="row">
        <span class="row-label">Mode</span>
        <span class="row-value">Domain + Heuristics</span>
      </div>
    </div>
    <div class="section" style="border-bottom:none;">
      <button id="signout-btn" style="width:100%; background:#18181b; border:1px solid rgba(255,255,255,0.08); color:#a1a1aa; padding:7px; border-radius:6px; font-size:11px; cursor:pointer;">
        Sign Out
      </button>
    </div>
    <div class="section" style="font-size:10px; color:#52525b; line-height:1.6; border-bottom:none;">
      🔒 Only domain, title, and duration are tracked.<br/>
      Message content is never captured.
    </div>
  `;

  document.getElementById('signout-btn').addEventListener('click', async () => {
    await chrome.storage.local.remove(['accessToken', 'refreshToken', 'deviceId', 'studentInfo', 'syncedTools']);
    window.location.reload();
  });
}

(async function () {
  const statusBar = document.getElementById('status-bar');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const content = document.getElementById('content');

  const stored = await chrome.storage.local.get([
    'accessToken', 'deviceId', 'studentInfo', 'syncedTools',
  ]);

  if (!stored.accessToken || !stored.deviceId) {
    renderSignedOut(content, statusBar, statusDot, statusText);
    return;
  }

  renderSignedIn(content, statusBar, statusDot, statusText, stored);
})();