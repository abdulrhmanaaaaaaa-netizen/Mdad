'use strict';

// مِداد — خادم Node.js بوحداته المدمجة فقط، دون axios أو أي حزم خارجية.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const persona = require('./persona.js');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const DEEPSEEK_BASE = 'https://deep-seek.ai';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon'
};

function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('حجم الطلب كبير جدًا.'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('صيغة الطلب غير صحيحة.')); }
    });
    req.on('error', reject);
  });
}

function extractCsrfToken(html) {
  // الصيغة التي يستخدمها كود DeepSeek الذي أرسله صاحب المشروع، مع بدائل شكلية بسيطة.
  const patterns = [
    /csrf-token"\s+content="([^"]+)"/i,
    /name=["']csrf-token["']\s+content=["']([^"']+)["']/i,
    /content=["']([^"']+)["']\s+name=["']csrf-token["']/i
  ];
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match && match[1]) return match[1];
  }
  return '';
}

function parseSSE(rawBody) {
  let answer = '';
  let providerError = '';
  for (const line of String(rawBody || '').split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean.startsWith('data:')) continue;
    const raw = clean.replace(/^data:\s*/, '').trim();
    if (!raw || raw === '[DONE]') continue;
    try {
      const json = JSON.parse(raw);
      const content = json?.choices?.[0]?.delta?.content
        ?? json?.choices?.[0]?.message?.content
        ?? json?.delta?.content
        ?? json?.content;
      if (typeof content === 'string') answer += content;
      else if (Array.isArray(content)) answer += content.map(part => part?.text || '').join('');
      if (json?.error?.message) providerError = json.error.message;
    } catch {
      // بعض رسائل SSE غير JSON؛ نتجاهلها مثل كود الإضافة الأصلية.
    }
  }
  if (answer.trim()) return { answer: answer.trim(), error: '' };

  // بعض الإصدارات تعيد JSON واحدًا بدل SSE؛ ندعم ذلك دون تغيير الطلب الأصلي.
  try {
    const json = JSON.parse(String(rawBody || '').trim());
    const content = json?.choices?.[0]?.message?.content
      ?? json?.choices?.[0]?.delta?.content
      ?? json?.answer ?? json?.content ?? json?.text;
    if (typeof content === 'string' && content.trim()) return { answer: content.trim(), error: '' };
    if (json?.error?.message || json?.error) providerError = json.error.message || String(json.error);
    if (json?.message && typeof json.message === 'string') providerError = json.message;
  } catch { /* الرد لم يكن JSON */ }
  return { answer: '', error: providerError || String(rawBody || '').slice(0, 1200) || 'لم يصل رد نصي من الخدمة.' };
}

async function fetchTextWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } finally { clearTimeout(timer); }
}

async function getCsrfToken() {
  const { response, text: html } = await fetchTextWithTimeout(`${DEEPSEEK_BASE}/chat`, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' }
  }, 30000);
  const token = extractCsrfToken(html);
  if (!token) {
    throw new Error(`تعذر استخراج رمز الحماية CSRF من صفحة DeepSeek (HTTP ${response.status}).`);
  }
  return token;
}

async function askDeepSeek(prompt, history = []) {
  // ينفذ نفس تسلسل الإضافة المرسلة: GET /chat ثم POST /api/chat.
  const csrf = await getCsrfToken();
  const messages = [
    ...history.slice(-10).filter(item => item && ['user', 'assistant'].includes(item.role)).map(item => ({
      role: item.role,
      content: String(item.content || '').slice(0, 10000)
    })),
    { role: 'user', content: String(prompt || '').slice(0, 24000) }
  ];

  const { response, text: rawBody } = await fetchTextWithTimeout(`${DEEPSEEK_BASE}/api/chat`, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'X-CSRF-TOKEN': csrf,
      'Origin': DEEPSEEK_BASE,
      'Referer': `${DEEPSEEK_BASE}/chat`
    },
    body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash', messages })
  }, 120000);
  if (!response.ok) {
    const parsed = parseSSE(rawBody);
    throw new Error(`أعادت خدمة DeepSeek حالة HTTP ${response.status}: ${parsed.error || rawBody.slice(0, 500)}`);
  }
  const parsed = parseSSE(rawBody);
  if (!parsed.answer) throw new Error(parsed.error || 'لم يصل رد صالح من DeepSeek.');
  return parsed.answer;
}

function buildChatPrompt(input) {
  const mode = ['chat', 'story', 'research', 'document', 'ideas'].includes(input.mode) ? input.mode : 'chat';
  const context = typeof input.projectContext === 'string' ? input.projectContext.slice(0, 14000) : '';
  const systemPrompt = persona.prompt(mode, context);
  const preferences = [
    input.thinkingEnabled === false
      ? 'قدّم إجابة مباشرة ومركزة.'
      : 'تعامل مع المهمة بعناية وراجع اتساق النتيجة قبل عرضها، دون كشف تفكير داخلي مطوّل.',
    input.searchEnabled === true
      ? 'إذا كانت واجهة النموذج تتيح بحثًا حقيقيًا في هذه الجلسة، فاستخدمه عند الحاجة، ولا تدّعِ البحث إن لم يكن متاحًا.'
      : 'لا تدّعِ استخدام البحث الخارجي ما لم يكن متاحًا ومنفذًا فعلًا.'
  ].join('\n');
  return `${systemPrompt}\n\nتفضيلات التنفيذ:\n${preferences}\n\nرسالة المستخدم الحالية:\n${String(input.message || '').slice(0, 12000)}`;
}

function buildProjectPrompt(input) {
  const type = input.type === 'research' ? 'research' : 'story';
  const title = String(input.title || '').trim().slice(0, 140);
  const description = String(input.description || '').trim().slice(0, 8000);
  const question = String(input.question || '').trim().slice(0, 4000);
  const optionalPlan = String(input.plan || '').trim().slice(0, 4000);
  const modePrompt = persona.prompt(type, `عنوان المشروع: ${title}\nالوصف المعتمد من المستخدم: ${description}`);
  const sourceSearchRule = input.searchEnabled === false
    ? 'لا تحاول الإيحاء بوجود بحث مباشر؛ اكتب المسودة وبيّن أن التوثيق يحتاج إلى مصادر.'
    : 'إن كانت واجهة النموذج توفر بحثًا مباشرًا فعليًا فاستخدمه للتحقق من المصادر، وإلا فلا تختلق مراجع أو روابط.';

  if (type === 'story') {
    const isNovel = /رواية|فصول|سلسلة|ملحمة/.test(`${title} ${description}`);
    const storyTask = isNovel
      ? 'أنشئ ملف رواية متكاملًا: ملخصًا، شخصيات، عالمًا، مخططًا من 10 إلى 14 فصلًا، واكتب الفصل الأول كاملًا كمشهد أدبي طويل ومتماسك. لا تدّعِ أن الرواية كلها اكتملت؛ اجعل الفصل الأول بداية فعلية قابلة للمتابعة.'
      : 'اكتب قصة قصيرة مكتملة فعلًا، لها بداية وشخصيات وصراع وتصاعد وذروة وحل ونهاية مؤثرة. لا تترك النهاية معلقة ولا تكتفِ بملخص أو افتتاحية. اجعل النص الأدبي هو الجزء الأهم، مع تفاصيل وحوار مناسبين.';
    const outlineRule = isNovel ? 'مخطط تفصيلي من 10 إلى 14 فصلًا، مع عنوان وملخص أحداث كل فصل' : 'مخطط موجز لمراحل القصة من البداية إلى النهاية';
    const contentRule = isNovel ? 'الفصل الأول كاملًا كمشهد أدبي فعلي، بحوار ووصف وأحداث' : 'القصة كاملة من بدايتها حتى نهايتها، بنص أدبي أصلي ومتماسك';
    return `${modePrompt}\n\nمهمة إنشاء مشروع قصصي:\nالعنوان: ${title}\nوصف الفكرة: ${description}\n\n${storyTask} ابتكر التفاصيل الناقصة بما يخدم فكرة المستخدم، مع الحفاظ على كل ما ذكره. أخرج JSON صحيحًا فقط دون Markdown أو أسوار كود، بالمفاتيح التالية وبقيم نصية عربية:\n{"summary":"ملخص جذاب ومتماسك","characters":"الشخصيات الرئيسية والثانوية وأسماؤها وصفاتها ودوافعها وعلاقاتها","world":"العالم والزمن والأماكن وقواعده وأجواؤه","outline":"${outlineRule}","content":"${contentRule}"}.\nلا تجعل العمل عامًا أو حشويًا. حافظ على منطق الشخصيات وتسلسل الأحداث، ولا تكتب خارج JSON.`;
  }

  return `${modePrompt}\n${sourceSearchRule}\n\nمهمة إنشاء مشروع بحثي متكامل:\nالعنوان: ${title}\nالوصف والغرض: ${description}\nسؤال البحث الإضافي: ${question || 'استنبط سؤالًا محددًا من العنوان والوصف.'}\nالخطة الإضافية: ${optionalPlan || 'ضع خطة مناسبة بنفسك.'}\n\nأنشئ مسودة بحث منظمة ومفيدة بالفعل، لا تكتفِ باقتراح خطة أو تعليمات للمستخدم. أخرج JSON صحيحًا فقط دون Markdown أو أسوار كود، بالمفاتيح التالية وبقيم نصية عربية:\n{\"question\":\"سؤال البحث الرئيسي وأسئلة فرعية عند الحاجة\",\"plan\":\"مقدمة، مباحث، مطالب أو محاور، منهجية، وتسلسل منطقي\",\"sources\":\"المصادر الحقيقية وروابطها فقط إذا كنت متأكدًا من وجودها وصحة بياناتها؛ لا تخترع أسماء أو روابط أو مؤلفين. إذا لم تتوفر مصادر موثوقة متحقق منها، اكتب بوضوح: يلزم استكمال التوثيق بمصادر محققة، واترك أي قائمة مراجع مختلقة\",\"content\":\"اكتب مسودة بحث فعلية تتضمن مقدمة ومحاور تحليلية وخاتمة ونتائج أولية، مع التمييز بين الحقائق والاستنتاجات، وبأسلوب بحثي واضح. لا تنسب ادعاءً إلى مرجع غير متحقق منه\"}.\nاكتب محتوى ذا قيمة ولا تكرر العنوان حشوًا. لا تخترع إحصاءات أو دراسات أو اقتباسات. أخرج JSON فقط.`;
}

async function handleChat(req, res) {
  let input;
  try { input = await readBody(req); } catch (error) { return send(res, 400, { error: error.message }); }
  if (!String(input.message || '').trim()) return send(res, 400, { error: 'اكتب رسالة أولًا.' });
  try {
    const answer = await askDeepSeek(buildChatPrompt(input), Array.isArray(input.history) ? input.history : []);
    return send(res, 200, { answer });
  } catch (error) {
    return send(res, 502, { error: `فشل طلب DeepSeek: ${error.message}` });
  }
}

async function handleProjectGeneration(req, res) {
  let input;
  try { input = await readBody(req); } catch (error) { return send(res, 400, { error: error.message }); }
  const type = input.type === 'research' ? 'research' : 'story';
  if (!String(input.title || '').trim() || !String(input.description || '').trim()) {
    return send(res, 400, { error: 'أدخل عنوان المشروع ووصفه أولًا.' });
  }
  try {
    const answer = await askDeepSeek(buildProjectPrompt({ ...input, type }));
    return send(res, 200, { answer, type, model: 'deepseek/deepseek-v4-flash' });
  } catch (error) {
    return send(res, 502, { error: `تعذر إنشاء المشروع من DeepSeek: ${error.message}` });
  }
}

async function serveStatic(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end('Bad Request'); }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const publicFiles = new Set([
    'index.html', 'styles.css', 'persona.js', 'app.js',
    'assets/midad-mascot.svg'
  ]);
  if (!publicFiles.has(relative)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('الملف غير متاح للعرض العام'); }
  const file = path.resolve(ROOT, relative);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    res.writeHead(403); return res.end('Forbidden');
  }
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) throw new Error('Not a file');
    const content = await fs.promises.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache'
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('الصفحة غير موجودة');
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') return handleChat(req, res);
  if (req.method === 'POST' && req.url === '/api/generate-project') return handleProjectGeneration(req, res);
  if (req.method === 'GET' && req.url === '/api/status') {
    return send(res, 200, { app: 'MIDĀD', provider: 'deep-seek.ai', model: 'deepseek/deepseek-v4-flash', configured: true, note: 'يتم جلب CSRF عند كل طلب. هذه الحالة لا ترسل طلبًا إلى DeepSeek.' });
  }
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  return send(res, 405, { error: 'الطريقة غير مدعومة.' }, { Allow: 'GET, HEAD, POST' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`MIDĀD server is running on port ${PORT}`);
  console.log('DeepSeek connector: deep-seek.ai/chat -> deep-seek.ai/api/chat (not tested automatically)');
});
