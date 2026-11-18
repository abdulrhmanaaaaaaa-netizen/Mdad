'use strict';

// مِداد — خادم صغير باستخدام وحدات Node.js المدمجة فقط، دون مكتبات خارجية.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const persona = require('./persona.js');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon'
};

function loadEnvFile() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile();

function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = ''; let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > limit) { reject(new Error('حجم الطلب كبير جدًا.')); req.destroy(); return; } body += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('صيغة الطلب غير صحيحة.')); } });
    req.on('error', reject);
  });
}
function findText(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 10) return '';
  const keys = ['answer', 'content', 'text', 'response', 'completion'];
  for (const key of keys) if (typeof value[key] === 'string' && value[key].trim()) return value[key];
  if (value.message) {
    if (typeof value.message === 'string') return value.message;
    const nested = findText(value.message, depth + 1); if (nested) return nested;
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') { const nested = findText(child, depth + 1); if (nested) return nested; }
  }
  return '';
}
function findNextMessageId(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 12) return null;
  const preferred = ['message_id', 'messageId', 'parent_message_id', 'parentMessageId'];
  for (const key of preferred) {
    const n = Number(value[key]);
    if (Number.isSafeInteger(n) && n > 0) return n;
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') { const found = findNextMessageId(child, depth + 1); if (found) return found; }
  }
  return null;
}
function requiredConfig() {
  const required = [
    'DEEPSEEK_POW_RESPONSE', 'DEEPSEEK_HIF_LEIM', 'DEEPSEEK_DEVICE_ID', 'DEEPSEEK_AUTHORIZATION',
    'DEEPSEEK_SHUMEI_DEVICE_ID', 'DEEPSEEK_CHAT_SESSION_ID'
  ];
  return required.every(key => Boolean(process.env[key]));
}
function buildHeaders() {
  return {
    'x-ds-pow-response': process.env.DEEPSEEK_POW_RESPONSE,
    'x-hif-leim': process.env.DEEPSEEK_HIF_LEIM,
    'x-device-id': process.env.DEEPSEEK_DEVICE_ID,
    'x-client-bundle-id': 'com.deepseek.chat',
    'x-client-platform': 'web',
    'x-client-version': '2.8.0',
    'x-client-locale': 'ar',
    'x-client-timezone-offset': '7200',
    'authorization': `Bearer ${process.env.DEEPSEEK_AUTHORIZATION}`,
    'content-type': 'application/json',
    'accept': '/',
    'user-agent': 'Mozilla/5.0 (Android 16; Mobile; rv:160.0) Gecko/160.0 Firefox/160.0',
    'referer': `https://chat.deepseek.com/a/chat/s/${process.env.DEEPSEEK_CHAT_SESSION_ID}`
  };
}
function buildPrompt(input) {
  const mode = ['chat', 'story', 'research', 'document', 'ideas'].includes(input.mode) ? input.mode : 'chat';
  const system = persona.prompt(mode, typeof input.projectContext === 'string' ? input.projectContext.slice(0, 14000) : '');
  const history = Array.isArray(input.history) ? input.history.slice(-16).map(item => {
    const role = item && item.role === 'assistant' ? 'مِداد' : 'المستخدم';
    const content = String(item && item.content || '').slice(0, 6000);
    return `${role}: ${content}`;
  }).join('\n\n') : '';
  const current = String(input.message || '').slice(0, 12000);
  return `${system}\n\n${history ? `سياق المحادثة السابقة:\n${history}\n\n` : ''}رسالة المستخدم الحالية:\n${current}`;
}

async function handleChat(req, res) {
  let input;
  try { input = await readBody(req); } catch (error) { return send(res, 400, { error: error.message }); }
  if (!String(input.message || '').trim()) return send(res, 400, { error: 'اكتب رسالة أولًا.' });
  if (!requiredConfig()) return send(res, 503, { error: 'إعدادات اتصال DeepSeek غير مكتملة على الخادم.' });
  if (typeof fetch !== 'function') return send(res, 500, { error: 'يتطلب الخادم Node.js 18 أو أحدث لتوفير fetch.' });

  const payload = {
    chat_session_id: process.env.DEEPSEEK_CHAT_SESSION_ID,
    parent_message_id: Number.isSafeInteger(Number(input.parentMessageId)) ? Number(input.parentMessageId) : Number(process.env.DEEPSEEK_PARENT_MESSAGE_ID || 12),
    model_type: null,
    prompt: buildPrompt(input),
    ref_file_ids: [],
    thinking_enabled: input.thinkingEnabled !== false,
    search_enabled: input.searchEnabled === true,
    action: null,
    preempt: false,
    shumei_device_id: process.env.DEEPSEEK_SHUMEI_DEVICE_ID
  };

  try {
    // الطلب يمر من الخادم فقط حتى لا تظهر بيانات الجلسة في JavaScript الخاص بالمتصفح.
    // لا توجد محاولة اختبار تلقائية؛ يُرسل الطلب فقط عند ضغط المستخدم على زر الإرسال.
    const upstream = await fetch('https://chat.deepseek.com/api/v0/chat/completion', {
      method: 'POST', headers: buildHeaders(), body: JSON.stringify(payload), redirect: 'manual'
    });
    const raw = await upstream.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    if (!upstream.ok) {
      return send(res, 502, {
        error: `أعاد خادم DeepSeek حالة HTTP ${upstream.status}.`,
        upstreamStatus: upstream.status,
        details: parsed ? findText(parsed) || 'لم تُرجع الواجهة رسالة نصية واضحة.' : raw.slice(0, 1500)
      });
    }
    const answer = parsed ? findText(parsed) : '';
    const nextParentMessageId = parsed ? findNextMessageId(parsed) : null;
    return send(res, 200, {
      answer: answer || raw,
      raw: answer ? undefined : raw,
      nextParentMessageId: nextParentMessageId || undefined,
      upstreamStatus: upstream.status
    });
  } catch (error) {
    return send(res, 502, { error: `تعذر الاتصال بخادم DeepSeek: ${error.message}` });
  }
}

async function serveStatic(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const publicFiles = new Set(['index.html', 'styles.css', 'persona.js', 'app.js', 'assets/midad-mascot-scene.png', 'assets/midad-mascot-avatar.png']);
  if (!publicFiles.has(relative)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('الملف غير متاح للعرض العام'); }
  const file = path.resolve(ROOT, relative);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    res.writeHead(403); return res.end('Forbidden');
  }
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) throw new Error('Not a file');
    const content = await fs.promises.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('الصفحة غير موجودة');
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') return handleChat(req, res);
  if (req.method === 'GET' && req.url === '/api/status') return send(res, 200, { app: 'MIDĀD', configured: requiredConfig(), note: 'لا يتم إرسال طلب اختبار إلى مزود الخدمة.' });
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  return send(res, 405, { error: 'الطريقة غير مدعومة.' }, { Allow: 'GET, HEAD, POST' });
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`MIDĀD server is running on port ${PORT}`);
  console.log(`DeepSeek session settings: ${requiredConfig() ? 'configured (not tested)' : 'incomplete'}`);
});
