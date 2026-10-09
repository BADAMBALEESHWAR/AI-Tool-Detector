# AI Tool Monitoring System

A complete cross-platform AI-usage monitoring system for educational institutions. The system tracks AI tool usage on student devices for academic integrity, capturing only metadata — never message content, keystrokes, or screenshots.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Students                                     │
│                                                                      │
│   ① Visit Student Dashboard (web)                                   │
│   ② Sign Up (SAP ID validated against Master List)                  │
│   ③ Download Desktop App                                            │
│   ④ Install → Sign In (in-app) → Device Activated                   │
│   ⑤ Use AI tools → Events tracked automatically                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                       REST API + WebSocket
                              │
┌─────────────────────────────────────────────────────────────────────┐
│              Backend (Node.js + Express + PostgreSQL)                │
│                                                                      │
│  Auth · Device Mgmt · Usage Events · AI Tools · Analytics          │
│  WebSocket → Admin Dashboard (live notifications)                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                     Real-time WebSocket
                              │
┌─────────────────────────────────────────────────────────────────────┐
│              Admin Dashboard (React web portal)                      │
│                                                                      │
│  Live Feed · AI Tools (Approve/Reject) · Logs · Analytics           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Components

| Component | Technology | Port |
|-----------|-----------|------|
| Backend API | Node.js + Express + Prisma | 3001 |
| Student Dashboard | React + Tailwind (Vite) | 5173 |
| Admin Dashboard | React + Tailwind (Vite) | 5174 |
| Desktop App | Electron (electron-vite) | — |
| Browser Extension | Manifest V3 (Chrome/Edge/Brave/Firefox) | — |
| Database | PostgreSQL | 5432 |

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- npm 10+

### 1. Database Setup

```bash
# Create PostgreSQL database
psql -U postgres -c "CREATE DATABASE ai_monitor;"
```

### 2. Backend

```bash
cd backend
copy .env.example .env
# Edit .env and set DATABASE_URL to your PostgreSQL connection string

npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

> Default admin credentials (change after first login!):
> - Email: `admin@institution.edu`
> - Password: `Admin@123`

### 3. Student Dashboard

```bash
cd student-dashboard
npm install
npm run dev
# Opens at http://localhost:5173
```

### 4. Admin Dashboard

```bash
cd admin-dashboard
npm install
npm run dev
# Opens at http://localhost:5174
```

### 5. Desktop App (Development)

```bash
cd desktop-app
npm install
npm run dev
# Opens Electron window with sign-in UI
```

### 6. Browser Extension

1. Open Chrome/Edge → `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` directory
5. The AI Monitor extension will appear in your toolbar

---

## Full User Flow

```
Student visits Student Dashboard
    ↓
Signs up (SAP ID validated against admin-uploaded Master List)
    ↓
Logs in → sees Download Center
    ↓
Downloads Desktop App installer for their OS
    ↓
Installs app → sees in-app Sign In screen
    ↓
Signs in with same SAP ID + password
    ↓
App: authenticates with backend + registers device
    ↓
Backend emits: device:activated → Admin Dashboard shows notification
    ↓
Background monitoring starts:
  • ps-list: scans running processes every 10s
  • active-win: checks active window title
  • Browser Extension: monitors tab URLs
    ↓
AI tool detected → Usage Event sent to backend
    ↓
Backend emits: usage:new → Admin Dashboard live notification card
    ↓
Unknown tool detected → flagged as "Pending" in Admin Dashboard
    ↓
Admin reviews → Approve/Reject
    ↓
Approved tools synced to all apps + extensions within 5 minutes
```

---

## Backend API Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Student signup (validates SAP ID) |
| POST | `/api/auth/signin` | Student signin → JWT tokens |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/admin/signin` | Admin signin → JWT token |

### Student (requires student JWT)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/student/profile` | Own profile |
| GET | `/api/student/devices` | Own registered devices |
| GET | `/api/student/usage` | Own usage history (paginated) |
| GET | `/api/student/stats` | Summary stats |

### Device (requires student JWT)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/device/activate` | Register/activate device (in-app sign-in) |
| POST | `/api/device/heartbeat` | Periodic ping (updates last_seen) |
| POST | `/api/device/deactivate` | Student logout from app |

### Usage Events (requires student JWT)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/usage/event` | Ingest usage event (desktop or browser) |

### AI Tools
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/tools` | Student | Sync built-in + approved tools |
| GET | `/api/tools/all` | Admin | All tools (any status) |
| GET | `/api/tools/pending` | Admin | Pending tools for review |
| POST | `/api/tools/flag` | Student | Flag unknown tool |
| PATCH | `/api/tools/:id/approve` | Admin | Approve pending tool |
| PATCH | `/api/tools/:id/reject` | Admin | Reject pending tool |

### Admin (requires admin JWT)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/master-list` | Upload student CSV |
| GET | `/api/admin/master-list` | List master entries |
| GET | `/api/admin/students` | All students + device status |
| GET | `/api/admin/usage` | Usage logs (filterable) |
| GET | `/api/admin/usage/export` | Export CSV |
| GET | `/api/admin/analytics` | Analytics data |
| GET | `/api/admin/settings` | App settings |
| PATCH | `/api/admin/settings` | Update settings |

### WebSocket Events (Socket.io)
| Event | Room | Payload |
|-------|------|---------|
| `usage:new` | admin-room | Usage event notification |
| `tool:pending` | admin-room | New unknown tool flagged |
| `device:activated` | admin-room + student-{sapId} | Device activation |
| `usage:own` | student-{sapId} | Student's own usage (for dashboard update) |

---

## Master List CSV Format

```csv
SAP_ID,Name,Branch
60004210001,Alice Johnson,Computer Science
60004210002,Bob Smith,Information Technology
60004210003,Carol Davis,Electronics Engineering
```

Column names are **case-insensitive** and support aliases:
- SAP ID: `sap_id`, `sapid`, `sap id`, `id`
- Name: `name`, `student_name`, `full_name`
- Branch: `branch`, `class`, `department`, `division`

---

## Built-in AI Tools (29 pre-seeded)

Web tools: ChatGPT, Google Gemini, Claude, Microsoft Copilot, Perplexity AI, Poe, Character.AI, HuggingFace Chat, You.com, DeepSeek, Mistral Le Chat, Grok, Pi AI, Meta AI, Google AI Studio, Phind, Blackbox AI, Notion AI, Writesonic, Jasper AI, Copy.ai, Cohere Coral, Kimi

Desktop app tools: ChatGPT Desktop, GitHub Copilot, Cursor AI, Codeium/Windsurf, Ollama, LM Studio

---

## Privacy & Compliance

- ✅ **Metadata only**: domain, page title, timestamps, duration
- ❌ **Never captured**: message content, keystrokes, clipboard, screenshots
- ✅ **Consent disclosure**: shown on both web signup and in-app signin screens
- ✅ **Data scoping**: students can only view their own data
- ✅ **Admin control**: monitoring hours configurable (or always-on)
- ✅ **Transparency**: students can view their own usage history on the dashboard

---

## Building for Production

### Backend
```bash
cd backend
npm run build
npm run db:migrate:prod  # Run migrations on production DB
npm start
```

### Student Dashboard
```bash
cd student-dashboard
npm run build
# Serve dist/ with nginx or similar
```

### Admin Dashboard
```bash
cd admin-dashboard
npm run build
```

### Desktop App Installers

> ⚠️ Build Windows installer on Windows; macOS installer on macOS.

```bash
cd desktop-app

# Windows
npm run dist:win    # Creates release/AI Monitor Setup.exe

# macOS
npm run dist:mac    # Creates release/AI Monitor.dmg

# Both (requires both OS builds merged)
npm run dist:all
```

---

## Enterprise Deployment

### Browser Extension (via Group Policy / Intune)

**Windows — Chrome/Edge via GPO:**
1. Download `extension/` directory and zip as `ai-monitor-extension.zip`
2. Host it on your internal server or use Chrome Web Store
3. Deploy via GPO: `Computer Configuration → Administrative Templates → Google Chrome → Extensions → Configure the list of force-installed apps and extensions`

**macOS — via MDM (Jamf / Intune):**
```xml
<!-- Chrome extension force-install -->
<key>ExtensionInstallForcelist</key>
<array>
  <string>EXTENSION_ID;https://clients2.google.com/service/update2/crx</string>
</array>
```

**Google Admin Console:**
1. Go to `Admin Console → Devices → Chrome → Apps & Extensions`
2. Force-install the AI Monitor extension for all student OUs

### Desktop App (via Intune / GPO)
```powershell
# Silent install (Windows)
"AI Monitor Setup.exe" /S
```

---

## Environment Variables

### Backend (`backend/.env`)
```
DATABASE_URL=postgresql://user:password@localhost:5432/ai_monitor
JWT_SECRET=<strong-random-string>
JWT_REFRESH_SECRET=<strong-random-string>
ADMIN_JWT_SECRET=<strong-random-string>
PORT=3001
FRONTEND_URL=https://student.yourinstitution.edu
ADMIN_URL=https://admin.yourinstitution.edu
```

### Student Dashboard (`student-dashboard/.env`)
```
VITE_API_URL=https://api.yourinstitution.edu/api
VITE_SOCKET_URL=https://api.yourinstitution.edu
```

### Admin Dashboard (`admin-dashboard/.env`)
```
VITE_API_URL=https://api.yourinstitution.edu/api
VITE_SOCKET_URL=https://api.yourinstitution.edu
```

---

## Security Notes

- All passwords hashed with bcrypt (cost factor 12)
- JWT access tokens expire in 15 minutes; refresh tokens in 7 days
- Auth endpoints rate-limited: 10 requests / 15 minutes
- Helmet.js applied for HTTP security headers
- CORS restricted to configured frontend origins
- Device tokens stored as hashed values in the database
- Students cannot access other students' data (all queries scoped by studentId)
- Admin JWT uses a separate secret from student JWT

---

## Project Structure

```
├── backend/                    # Node.js + Express + Prisma
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema
│   │   └── seed.ts             # Seed: 29 AI tools + default admin
│   └── src/
│       ├── index.ts            # Express + Socket.IO server
│       ├── middleware/         # Auth (JWT), error handler
│       ├── routes/             # auth, student, device, usage, tools, admin
│       ├── services/socket.ts  # Socket.IO event emitters
│       └── utils/              # Prisma client, logger
│
├── student-dashboard/          # React + Tailwind (Vite, port 5173)
│   └── src/
│       ├── contexts/           # AuthContext
│       ├── layouts/            # DashboardLayout
│       ├── pages/              # Auth, Home, Download, Usage, Profile
│       └── lib/api.ts          # Axios client with JWT interceptors
│
├── admin-dashboard/            # React + Tailwind (Vite, port 5174)
│   └── src/
│       ├── contexts/           # AdminAuthContext
│       ├── layouts/            # AdminLayout
│       └── pages/              # Login, Notifications, Tools, Students,
│                               #   Logs, Analytics, Settings
│
├── desktop-app/                # Electron (electron-vite)
│   └── src/
│       ├── main/               # Main process
│       │   ├── index.ts        # App entry, window, tray
│       │   ├── monitor.ts      # Background monitoring agent
│       │   ├── toolsDB.ts      # AI tools DB loader + matchers
│       │   ├── heartbeat.ts    # Periodic device ping
│       │   ├── sync.ts         # Tool list sync from backend
│       │   └── ipc.ts          # IPC handlers (sign-in, sign-out)
│       ├── preload/index.ts    # Context bridge API
│       ├── renderer/           # React UI (sign-in screen, status)
│       └── data/ai-tools.json  # Built-in AI tools (bundled at build)
│
├── extension/                  # Browser Extension (MV3)
│   ├── manifest.json
│   ├── background/             # Service worker (domain match + session tracking)
│   ├── content/                # Heuristic structural fingerprinting
│   └── popup/                  # Extension popup UI
│
└── docs/
    └── README.md               # This file
```

---

## License

For institutional use. All monitoring is disclosed to students at signup and in-app. Consult your institution's privacy counsel before deployment.
