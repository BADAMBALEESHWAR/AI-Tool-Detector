# 🛡️ AI Tool Monitoring & Academic Integrity System

[![Node.js Version](https://img.shields.io/badge/node.js-v20%2B-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/database-PostgreSQL%2015%2B-blue.svg)](https://www.postgresql.org/)
[![TypeScript](https://img.shields.io/badge/typescript-v5.4%2B-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/react-v18%20%2F%20v19-61dafb.svg)](https://react.dev/)
[![Electron](https://img.shields.io/badge/electron-v31-47848F.svg)](https://www.electronjs.org/)
[![Manifest V3](https://img.shields.io/badge/extension-Manifest%20V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License](https://img.shields.io/badge/license-Institutional-lightgrey.svg)](#license)

A comprehensive, enterprise-grade, cross-platform AI usage monitoring and academic integrity platform for colleges, universities, and educational institutions.

The system transparently tracks generative AI usage across student desktop environments and web browsers during examinations, assignments, and campus sessions. It operates on a **privacy-first metadata-only principle**: recording tool names, domains, process titles, timestamps, and active durations — **strictly never capturing message content, chat prompts, keystrokes, or screenshots**.

> **🐳 Docker & AWS:** run the whole stack with `docker compose up --build` from `Aitooldetector/`, and deploy to AWS (ECR + EC2) automatically through GitHub Actions. See [Aitooldetector/DEPLOYMENT.md](Aitooldetector/DEPLOYMENT.md).

---

## 📑 Table of Contents

- [System Architecture](#-system-architecture)
- [Project Components](#-project-components)
- [Key Features](#-key-features)
- [Privacy & Compliance Policy](#-privacy--compliance-policy)
- [Project Directory Structure](#-project-directory-structure)
- [Prerequisites](#-prerequisites)
- [Quick Start Guide](#-quick-start-guide)
  - [1. Database Setup](#1-database-setup)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Student Dashboard Setup](#3-student-dashboard-setup)
  - [4. Admin Dashboard Setup](#4-admin-dashboard-setup)
  - [5. Desktop App Setup](#5-desktop-app-setup)
  - [6. Browser Extension Setup](#6-browser-extension-setup)
- [End-to-End User Flow](#-end-to-end-user-flow)
- [AI Tool Detection Engine](#-ai-tool-detection-engine)
- [REST API & WebSocket Reference](#-rest-api--websocket-reference)
- [Master List CSV Format](#-master-list-csv-format)
- [Building for Production](#-building-for-production)
- [Enterprise Deployment (GPO, MDM, Intune)](#-enterprise-deployment-gpo-mdm-intune)
- [Environment Configuration](#-environment-configuration)
- [Security Architecture](#-security-architecture)
- [Troubleshooting & FAQ](#-troubleshooting--faq)
- [License](#-license)

---

## 🏛️ System Architecture

```
                               ┌──────────────────────────────────────────────┐
                               │              STUDENT WORKSTATION             │
                               │                                              │
                               │   ┌──────────────────────────────────────┐   │
                               │   │      Browser Extension (MV3)         │   │
                               │   │   • URL / Domain matching            │   │
                               │   │   • Heuristic DOM fingerprinting     │   │
                               │   └──────────────────┬───────────────────┘   │
                               │                      │                       │
                               │   ┌──────────────────┴───────────────────┐   │
                               │   │      Desktop App (Electron)          │   │
                               │   │   • Process scanner (ps-list)        │   │
                               │   │   • Window title tracker             │   │
                               │   │   • Async PowerShell Win32 scan      │   │
                               │   │   • Heartbeat & Tool DB sync         │   │
                               │   └──────────────────┬───────────────────┘   │
                               └──────────────────────┼───────────────────────┘
                                                      │ REST API
                                                      │ (HTTPS / Bearer JWT)
                                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                               BACKEND SERVER (Node.js + Express)                            │
│                                                                                             │
│  • Authentication (Student SAP validation & Admin JWT)                                      │
│  • Device Registration, Verification & Heartbeat tracking                                   │
│  • AI Tools Registry (Built-in signatures, admin approved, community pending)               │
│  • Usage Ingestion Pipeline with auto-session aggregation                                   │
│  • Real-time Socket.IO Server (Admin broadcast & Student personal channel)                  │
│  • Analytics Engine, CSV Exports, and Installer Distribution Services                       │
└───────────────────────────────┬─────────────────────────────┬───────────────────────────────┘
                                │                             │
                Prisma ORM Client                             │ Real-time WebSockets
                                ▼                             ▼
      ┌──────────────────────────────────┐         ┌─────────────────────────────────────┐
      │     PostgreSQL Database          │         │     ADMIN DASHBOARD (React)         │
      │                                  │         │                                     │
      │  • admin_users                   │         │  • Real-time Live Alert Feed        │
      │  • student_master_entries        │         │  • Tool Approval / Rejection Queue  │
      │  • students                      │         │  • Master Student Roster & Reset    │
      │  • devices                       │         │  • Detailed Filterable Usage Logs   │
      │  • ai_tool_signatures            │         │  • Trend Analytics & Visual Charts  │
      │  • usage_events                  │         │  • Exam / Monitoring Window Control │
      │  • app_settings                  │         └─────────────────────────────────────┘
      └──────────────────────────────────┘
```

---

## 🧩 Project Components

| Component | Directory | Technology Stack | Default Port / Target | Purpose |
|---|---|---|---|---|
| **Backend API** | `Aitooldetector/backend/` | Node.js, Express, TypeScript, Prisma ORM, PostgreSQL, Socket.IO | `3001` | Central REST API, database management, WebSocket hub, and installer hosting. |
| **Admin Dashboard** | `Aitooldetector/admin-dashboard/` | React 19, TypeScript, Vite 8, Tailwind CSS, Recharts, Lucide | `5174` | Administrative control portal: live notifications, tool management, analytics, and roster management. |
| **Student Dashboard** | `Aitooldetector/student-dashboard/` | React 19, TypeScript, Vite 8, Tailwind CSS, Recharts | `5173` | Student self-service portal: SAP ID registration, desktop app/extension downloads, personal usage transparency. |
| **Desktop Client** | `Aitooldetector/desktop-app/` | Electron 31, Electron-Vite 2, React 18, TypeScript, `active-win`, `ps-list` | Desktop App | Background monitoring daemon, tray application, window/process scanner, and local session reporter. |
| **Browser Extension** | `Aitooldetector/extension/` | Manifest V3 (Chrome, Edge, Brave, Firefox) | Extension | Tab and URL domain monitoring, dynamic heuristics, and real-time web session telemetry. |
| **Documentation** | `Aitooldetector/docs/` | Markdown | — | Architecture specifications and verification changelogs. |

---

## ✨ Key Features

### 👨‍💼 For Administrators
- **Real-Time Live Event Feed**: Sub-second alert stream showing student device activations, AI tool launches, and session durations via WebSockets.
- **AI Tool Approval Queue**: Automatic flagging of newly discovered AI platforms; one-click Approve/Reject controls that propagate to all student devices within 5 minutes.
- **Roster Enforcement**: Bulk CSV upload of official institutional student rosters (SAP ID, Name, Department). Only pre-listed SAP IDs can register.
- **Account Administration**: Temporary password generation for locked-out students, account suspension, and device unlinking.
- **Audit Logs & Export**: Granular filter by date, student, branch, tool, or detection source; one-click export to CSV.
- **Rich Analytics**: Visual breakdown of most-used AI tools, branch-wise adoption, peak daily usage hours, and active device trends.
- **Configurable Monitoring Hours**: Schedule monitoring strictly during class/exam hours or operate 24/7.

### 🎓 For Students
- **Full Transparency**: Students can view their complete personal usage history, active devices, and session metrics.
- **Single-Click Installer Center**: Direct download of pre-configured Windows (`.exe`) and macOS (`.dmg`) desktop installers.
- **Streamlined Authentication**: Simple login with institutional SAP ID and password pairs desktop clients and browser extensions automatically.
- **Self-Service Account Management**: Password reset and device management without administrative intervention.

---

## 🔒 Privacy & Compliance Policy

The system is built to comply with institutional privacy mandates, FERPA, and ethical data governance:

- ✅ **Metadata Only**: Captures only application/process name, window title, domain name, start/end timestamps, and active duration.
- ❌ **Zero Keystroke Logging**: The application contains no keylogging facilities.
- ❌ **Zero Content Capture**: Does not record chat prompts, AI responses, code snippets, or clipboard data.
- ❌ **Zero Screen Recording**: Never captures screenshots, video streams, or webcam feeds.
- ✅ **Explicit Consent**: Transparent terms of service and monitoring disclosures displayed during student signup and desktop app setup.
- ✅ **Isolated Student Data**: Students can only access their own telemetry; database queries are strictly scoped by `studentId`.

---

## 📂 Project Directory Structure

```text
Ai_tool_detector_COMPLETE/
├── package-lock.json
└── Aitooldetector/
    ├── backend/                          # Express + TypeScript + Prisma API
    │   ├── prisma/
    │   │   ├── schema.prisma             # PostgreSQL Database schema
    │   │   └── seed.ts                   # Seeds 29+ AI tools & default admin
    │   ├── src/
    │   │   ├── index.ts                  # Server entry & Socket.IO initialization
    │   │   ├── middleware/               # JWT authentication & error handling
    │   │   ├── routes/                   # auth, student, device, usage, tools, admin, downloads
    │   │   ├── services/                 # Socket.IO event broadcasters
    │   │   └── utils/                    # Prisma client, logger, AI tool presets
    │   ├── downloads/                    # Installer distribution storage
    │   └── package.json
    │
    ├── student-dashboard/                # Student Web Portal (React + Vite)
    │   ├── src/
    │   │   ├── contexts/                 # AuthContext (JWT state)
    │   │   ├── layouts/                  # Navigation & layout wrappers
    │   │   ├── pages/                    # Auth, Home, Download, Setup, Usage, Profile
    │   │   └── lib/api.ts                # Axios client with token interceptors
    │   ├── package.json
    │   └── vite.config.ts
    │
    ├── admin-dashboard/                  # Admin Control Web Portal (React + Vite)
    │   ├── src/
    │   │   ├── contexts/                 # AdminAuthContext
    │   │   ├── layouts/                  # Admin layout & sidebar
    │   │   ├── pages/                    # Live Feed, Tools, Students, Logs, Analytics, Settings
    │   │   └── lib/api.ts                # Axios instance
    │   ├── package.json
    │   └── vite.config.ts
    │
    ├── desktop-app/                      # Cross-platform Electron Agent
    │   ├── src/
    │   │   ├── main/
    │   │   │   ├── index.ts              # Electron lifecycle, window & tray management
    │   │   │   ├── monitor.ts            # Core detection loop (ps-list, active-win, PowerShell)
    │   │   │   ├── toolsDB.ts            # Tool signature matching & cache loader
    │   │   │   ├── heartbeat.ts          # Periodic device health beacon (60s)
    │   │   │   ├── sync.ts               # Cloud signature synchronization (5 min)
    │   │   │   └── ipc.ts                # Inter-process communication handlers
    │   │   ├── preload/index.ts          # Secure context bridge
    │   │   ├── renderer/                 # React UI (status & login window)
    │   │   └── data/ai-tools.json        # Built-in offline AI signatures
    │   ├── resources/                    # App icons (.ico, .icns, .png)
    │   └── package.json
    │
    ├── extension/                        # Browser Extension (MV3)
    │   ├── manifest.json                 # Chrome/Edge/Firefox manifest
    │   ├── background/
    │   │   └── service-worker.js         # URL monitoring & session tracking service worker
    │   ├── content/
    │   │   └── heuristic.js              # DOM structure heuristic analyzer
    │   ├── options/                      # Config page for custom server URL
    │   ├── popup/                        # Extension toolbar status popup
    │   └── icons/                        # Extension icon assets
    │
    └── docs/                             # Documentation & Technical Notes
        ├── README.md                     # System specifications
        └── CHANGELOG_FIXES.md            # Fixes and verification audit log
```

---

## ⚙️ Prerequisites

Ensure the following tools are installed on your host system:

- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher
- **PostgreSQL**: `v15.x` or higher (running locally or accessible remotely)
- **Git**

---

## 🚀 Quick Start Guide

### 1. Database Setup

Create a dedicated PostgreSQL database:

```bash
# Using psql CLI
psql -U postgres -c "CREATE DATABASE ai_monitor;"
```

---

### 2. Backend Setup

```bash
cd Aitooldetector/backend

# Create and configure your environment file
cp .env.example .env
# Edit .env and ensure DATABASE_URL matches your PostgreSQL credentials:
# DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/ai_monitor?schema=public"

# Install dependencies
npm install

# Run database migrations and seed default data
npx prisma migrate dev --name init
npm run db:seed

# Start backend in development mode
npm run dev
```

The backend starts at: **`http://localhost:3001`**

> **Default Administrator Credentials:**
> - **Email**: `admin@institution.edu`
> - **Password**: `Admin@123`
> *(Please change this immediately after your first sign-in!)*

---

### 3. Student Dashboard Setup

In a new terminal window:

```bash
cd Aitooldetector/student-dashboard

# Install dependencies
npm install

# Start development server
npm run dev
```

The Student Portal opens at: **`http://localhost:5173`**

---

### 4. Admin Dashboard Setup

In a new terminal window:

```bash
cd Aitooldetector/admin-dashboard

# Install dependencies
npm install

# Start development server
npm run dev
```

The Admin Portal opens at: **`http://localhost:5174`**

---

### 5. Desktop App Setup

In a new terminal window:

```bash
cd Aitooldetector/desktop-app

# Install dependencies
npm install

# Run in development mode
npm run dev
```

The Electron app launches showing the **AI Monitor Student Sign-In** screen.

---

### 6. Browser Extension Setup

1. Open **Google Chrome**, **Microsoft Edge**, or **Brave**.
2. Navigate to `chrome://extensions/` (or `edge://extensions/`).
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the directory: `Aitooldetector/extension/`.
6. Pin the **AI Monitor** icon to your toolbar.
7. Click the extension icon → Click **Options** (gear icon) to confirm or configure the backend URL (`http://localhost:3001/api`).

---

## 🔄 End-to-End User Flow

```
1. Master List Upload
   Admin logs into http://localhost:5174 → Navigates to Students → Uploads CSV roster.

2. Student Registration
   Student visits http://localhost:5173 → Enters SAP ID, Name, Email, and Password.
   Backend verifies SAP ID against master list before allowing registration.

3. Agent Download & Pairing
   Student logs in → Navigates to Download Center → Installs Desktop App.
   Student launches Desktop App → Signs in with their SAP credentials.
   Desktop App generates hardware-bound device token → Registers device via /api/device/activate.
   Admin Dashboard receives instant live notification: "Device Activated".

4. Real-time Monitoring & Detection
   Student opens an AI tool (e.g., ChatGPT, Claude, Cursor, or Ollama):
   - Desktop App detects process name or active window title.
   - Browser Extension detects active tab domain or heuristic chat signatures.
   Usage event is transmitted to /api/usage/event.
   Admin Dashboard live feed displays real-time alert card with student details and session duration.

5. Intelligent Tool Discovery
   If an unknown AI tool is detected, it is flagged as "PENDING".
   Admin reviews tool in Tools Management → Clicks "Approve".
   Approved signature syncs across all campus devices automatically.
```

---

## 🧠 AI Tool Detection Engine

The monitoring system employs a layered, multi-tier detection architecture:

### 1. Pre-Seeded Catalog (35+ Built-In Signatures)
- **Web AI Assistants**: ChatGPT, Claude, Google Gemini, Microsoft Copilot, Perplexity AI, DeepSeek, Grok, Mistral Le Chat, Poe, Character.AI, HuggingFace Chat, Google AI Studio, NotebookLM, Bolt.new, Lovable, v0, Blackbox AI, Phind, You.com, Pi AI, Meta AI, Kimi, Cohere Coral, Jasper, Copy.ai, Qwen.
- **Desktop Apps & Developer Tools**: ChatGPT Desktop, GitHub Copilot (VS Code / JetBrains), Cursor AI, Windsurf / Codeium, Ollama, LM Studio.

### 2. Multi-Tier Desktop Detection (`desktop-app`)
- **Process Enumeration (`ps-list`)**: Scans running system processes against recognized executable patterns (`ChatGPT.exe`, `cursor.exe`, `ollama.exe`).
- **Active Window Inspection (`active-win`)**: Identifies browser tab titles and standalone desktop app titles matching AI signatures.
- **Asynchronous Win32 PowerShell Scan**: Performs lightweight, non-blocking scans of open window titles without freezing the UI.
- **System Whitelist Protection**: Ignores system binaries, background OS tasks, and productivity apps (`explorer.exe`, `System`, `svchost.exe`).

### 3. Browser Heuristic Detection (`extension`)
- **Domain Matching**: Direct regex matching on full URLs and known subdomains.
- **DOM Fingerprinting (`heuristic.js`)**: Scans document structure for chat container patterns, streaming token indicators, and prompt inputs without inspecting message text.

---

## 📡 REST API & WebSocket Reference

### Authentication Endpoints (`/api/auth`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/signup` | Public | Student account registration (validates SAP ID against master list). |
| `POST` | `/api/auth/signin` | Public | Student sign-in; returns access & refresh JWT tokens. |
| `POST` | `/api/auth/refresh` | Public | Exchanges refresh token for new access token. |
| `POST` | `/api/auth/admin/signin` | Public | Administrator sign-in; returns admin JWT. |

### Student Endpoints (`/api/student`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/student/profile` | Student | Retrieves authenticated student's profile. |
| `GET` | `/api/student/devices` | Student | Lists student's registered devices. |
| `GET` | `/api/student/usage` | Student | Paginated history of student's own AI tool usage. |
| `GET` | `/api/student/stats` | Student | Summary statistics (total time, top tools). |
| `PATCH` | `/api/student/change-password` | Student | Self-service password modification. |

### Device Management (`/api/device`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/device/activate` | Student | Registers/activates desktop client for student. |
| `POST` | `/api/device/heartbeat` | Student | Periodic keep-alive beacon updating `lastSeen`. |
| `POST` | `/api/device/deactivate` | Student | Unregisters device upon student sign-out. |

### Usage Events (`/api/usage`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/usage/event` | Student | Ingests usage event telemetry (desktop or extension). |

### AI Tools Management (`/api/tools`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/tools` | Student | Syncs built-in and approved AI tool signatures. |
| `GET` | `/api/tools/all` | Admin | Lists all tools regardless of status. |
| `GET` | `/api/tools/pending` | Admin | Fetches queue of auto-flagged pending tools. |
| `POST` | `/api/tools/flag` | Student | Flags an unidentified tool for administrative review. |
| `PATCH` | `/api/tools/:id/approve`| Admin | Approves a pending tool. |
| `PATCH` | `/api/tools/:id/reject` | Admin | Rejects a pending tool. |

### Admin Endpoints (`/api/admin`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/admin/master-list` | Admin | Uploads official student master roster CSV. |
| `GET` | `/api/admin/master-list` | Admin | Lists master roster entries. |
| `GET` | `/api/admin/students` | Admin | Lists registered students with activation status. |
| `PATCH` | `/api/admin/students/:id/status` | Admin | Suspends or reactivates a student account. |
| `PATCH` | `/api/admin/students/:id/reset-password` | Admin | Generates temporary password for a student. |
| `GET` | `/api/admin/usage` | Admin | Filterable, paginated usage logs. |
| `GET` | `/api/admin/usage/export` | Admin | Streams usage logs as downloadable CSV. |
| `GET` | `/api/admin/analytics` | Admin | Aggregated metrics for analytics charts. |
| `GET` | `/api/admin/settings` | Admin | Retrieves system settings and monitoring hours. |
| `PATCH` | `/api/admin/settings` | Admin | Updates system settings and schedules. |

### WebSocket Events (Socket.IO)
| Event | Target Room | Payload | Purpose |
|---|---|---|---|
| `usage:new` | `admin-room` | Usage event record | Pushes real-time detection alert to Admin live feed. |
| `tool:pending` | `admin-room` | Tool signature details | Alerts admin of a newly discovered unknown tool. |
| `device:activated`| `admin-room`, `student-{sapId}` | Device record | Updates live device counter on admin and student dashboards. |
| `usage:own` | `student-{sapId}` | Usage event | Refreshes active student's personal usage feed. |

---

## 📋 Master List CSV Format

The administrative roster upload feature accepts standard CSV files:

```csv
SAP_ID,Name,Branch
60004210001,Alice Johnson,Computer Science
60004210002,Bob Smith,Information Technology
60004210003,Carol Davis,Electronics Engineering
```

**Supported Column Header Aliases (Case-Insensitive):**
- **SAP ID**: `sap_id`, `sapid`, `sap id`, `id`, `roll_no`, `rollno`
- **Name**: `name`, `student_name`, `full_name`, `studentname`
- **Branch**: `branch`, `department`, `dept`, `class`, `division`

---

## 📦 Building for Production

### 1. Backend Production Build
```bash
cd Aitooldetector/backend
npm run build
npm run db:migrate:prod
node dist/index.js
```

### 2. Dashboards Production Build
```bash
# Student Dashboard
cd Aitooldetector/student-dashboard
npm run build
# Distributable static files generated in dist/

# Admin Dashboard
cd Aitooldetector/admin-dashboard
npm run build
# Distributable static files generated in dist/
```
*Deploy `dist/` directories using Nginx, Caddy, Cloudflare Pages, or AWS S3 + CloudFront.*

### 3. Desktop Application Installers
```bash
cd Aitooldetector/desktop-app

# Windows Installer (.exe) - Run on Windows
npm run dist:win
# Output: release/AI Monitor Setup.exe

# macOS Installer (.dmg) - Run on macOS
npm run dist:mac
# Output: release/AI Monitor.dmg
```

Copy the generated installers into `Aitooldetector/backend/downloads/` so students can download them directly through the web portal.

---

## 🏢 Enterprise Deployment (GPO, MDM, Intune)

### 1. Browser Extension Deployment
- **Google Chrome / Microsoft Edge via Windows Group Policy (GPO):**
  1. Package `extension/` as a ZIP archive or publish to an internal enterprise extension store.
  2. In Group Policy Management:
     `Computer Configuration → Policies → Administrative Templates → Google Chrome → Extensions → Configure the list of force-installed apps and extensions`.
  3. Add the extension ID and update URL.
- **macOS via Jamf Pro or Microsoft Intune:**
  Deploy using Chrome's `ExtensionInstallForcelist` configuration profile dictionary.

### 2. Desktop Client Silent Deployment
Deploy the NSIS installer silently to managed campus lab computers:
```powershell
"AI Monitor Setup.exe" /S
```

---

## 🔧 Environment Configuration

### Backend (`Aitooldetector/backend/.env`)
```ini
# PostgreSQL Connection URL
DATABASE_URL="postgresql://postgres:password@localhost:5432/ai_monitor?schema=public"

# JWT Secrets (Generate secure random 64-char strings)
JWT_SECRET="super-secret-student-jwt-key"
JWT_REFRESH_SECRET="super-secret-student-refresh-key"
ADMIN_JWT_SECRET="super-secret-admin-jwt-key"

# Server Port & Allowed Origins
PORT=3001
FRONTEND_URL="http://localhost:5173"
ADMIN_URL="http://localhost:5174"
NODE_ENV="development"
```

### Student Dashboard (`Aitooldetector/student-dashboard/.env`)
```ini
VITE_API_URL="http://localhost:3001/api"
VITE_SOCKET_URL="http://localhost:3001"
```

### Admin Dashboard (`Aitooldetector/admin-dashboard/.env`)
```ini
VITE_API_URL="http://localhost:3001/api"
VITE_SOCKET_URL="http://localhost:3001"
```

---

## 🛡️ Security Architecture

- **Password Cryptography**: Salted bcrypt hashing (12 rounds) on all student and administrator passwords.
- **JWT Token Lifecycles**:
  - Access tokens: 15-minute expiration.
  - Refresh tokens: 7-day expiration with secure rotation.
  - Distinct cryptographic secrets separating student and administrator authorization domains.
- **Network Hardening**:
  - Helmet.js security headers (HSTS, Content Security Policy, X-Frame-Options).
  - Strict CORS origin allowlisting (supports browsers, electron clients, and extension protocols).
  - Rate limiting on authentication routes (10 attempts per 15-minute window).
- **Database Safeguards**:
  - Composite constraints (`@@unique([studentId, hostname])`) to eliminate device registration race conditions.
  - Foreign key cascading on student unregistration.

---

## ❓ Troubleshooting & FAQ

#### Q: How do I reset the Admin password if forgotten?
A: You can re-run the seed script or execute a Prisma script:
```bash
cd Aitooldetector/backend
npm run db:seed
```

#### Q: Why does the desktop app say "Disconnected" or fail to report events?
A: 
1. Verify that the backend is running on `http://localhost:3001` and reachable.
2. Ensure the student has completed sign-in inside the desktop client window.
3. Check that the device has an active token in the app settings (stored via `electron-store`).

#### Q: Can students disable the desktop client?
A: The desktop app runs minimized in the system tray. For institutional lab environments, install the application as a background service via Group Policy or disable task termination privileges for standard user accounts.

---

## 📄 License

This software is developed for institutional academic integrity and educational monitoring. Institutional deployment should comply with campus IT policies and local student privacy regulations.

Developed with ❤️ for Academic Integrity & Transparent Learning.
