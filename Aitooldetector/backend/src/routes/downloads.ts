import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

export const downloadsRouter = Router();

// Ensure downloads directory exists
const downloadsDir = path.join(process.cwd(), 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

function resolveDownloadFile(filename: string): { filePath: string; downloadName: string; contentType: string } | null {
  const lower = filename.toLowerCase();

  // 1. ZIP requests (Chrome/Edge safe, never blocked)
  if (lower.includes('.zip') || lower.includes('windows.zip') || lower.includes('setup.zip')) {
    const zipCandidates = [
      path.join(downloadsDir, 'AI-Monitor-Windows.zip'),
      path.join(downloadsDir, 'extension.zip'),
      path.join(downloadsDir, filename),
    ];
    for (const p of zipCandidates) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return {
          filePath: p,
          downloadName: filename.endsWith('.zip') ? filename : 'AI-Monitor-Windows.zip',
          contentType: 'application/zip',
        };
      }
    }
  }

  // 2. Windows Executable Setup requests
  if (lower.includes('setup.exe') || lower.includes('ai-monitor-setup') || lower.includes('ai monitor setup')) {
    const exeCandidates = [
      path.join(downloadsDir, 'AI Monitor Setup 1.0.0.exe'),
      path.join(downloadsDir, 'AI Monitor Setup.exe'),
      path.join(downloadsDir, 'ai-monitor-Setup.exe'),
      path.join(process.cwd(), '..', 'desktop-app', 'release', 'AI Monitor Setup 1.0.0.exe'),
      path.join(process.cwd(), '..', 'desktop-app', 'release', 'AI Monitor Setup.exe'),
    ];
    for (const p of exeCandidates) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return {
          filePath: p,
          downloadName: 'AI-Monitor-Setup.exe',
          contentType: 'application/octet-stream',
        };
      }
    }
  }

  // 3. macOS DMG requests
  if (lower.includes('dmg') || lower.includes('installer.dmg')) {
    const dmgCandidates = [
      path.join(downloadsDir, 'AI Monitor.dmg'),
      path.join(downloadsDir, 'ai-monitor-Installer.dmg'),
      path.join(process.cwd(), '..', 'desktop-app', 'release', 'AI Monitor.dmg'),
    ];
    for (const p of dmgCandidates) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return {
          filePath: p,
          downloadName: 'AI-Monitor.dmg',
          contentType: 'application/x-apple-diskimage',
        };
      }
    }
  }

  // 4. Direct filename match in downloads or release
  const directCandidates = [
    path.join(downloadsDir, filename),
    path.join(process.cwd(), '..', 'desktop-app', 'release', filename),
  ];
  for (const p of directCandidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return {
        filePath: p,
        downloadName: path.basename(p),
        contentType: 'application/octet-stream',
      };
    }
  }

  return null;
}

// Support HEAD requests cleanly (prevents curl -I or browser preflights from hanging)
downloadsRouter.head('/:filename', (req: Request, res: Response) => {
  const match = resolveDownloadFile(req.params.filename);
  if (match) {
    const stat = fs.statSync(match.filePath);
    res.setHeader('Content-Type', match.contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${match.downloadName}"`);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).end();
    return;
  }
  res.status(404).end();
});

downloadsRouter.get('/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename;
  logger.info(`Download requested: ${filename}`);

  const match = resolveDownloadFile(filename);
  if (!match) {
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Download AI Monitor</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #18181b; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; max-width: 480px; text-align: center; }
            h2 { color: #a78bfa; margin-top: 0; }
            p { color: #a1a1aa; font-size: 14px; line-height: 1.6; }
            code { background: #27272a; color: #38bdf8; padding: 2px 6px; rounded: 4px; font-size: 13px; }
            .btn { display: inline-block; background: #7c3aed; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 500; margin-top: 16px; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>📦 Installer Package</h2>
            <p>File not found for: <code>${filename}</code></p>
            <p>For development, you can run the app directly using: <br/><code>cd desktop-app && npm run dev</code></p>
            <a class="btn" href="javascript:history.back()">← Go Back</a>
          </div>
        </body>
      </html>
    `);
    return;
  }

  try {
    const stat = fs.statSync(match.filePath);
    res.setHeader('Content-Type', match.contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${match.downloadName}"`);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.removeHeader('X-Download-Options');

    const stream = fs.createReadStream(match.filePath);
    stream.pipe(res);
    stream.on('error', (err) => {
      logger.error('Download stream error:', err);
      if (!res.headersSent) {
        res.status(500).send('Download failed');
      }
    });
  } catch (err: any) {
    logger.error('Download handler error:', err);
    if (!res.headersSent) {
      res.status(500).send('Download failed');
    }
  }
});
