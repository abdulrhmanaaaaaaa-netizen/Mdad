(() => {
  'use strict';
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];
  const root = $('#pageRoot');
  const modalLayer = $('#modalLayer');
  const PERSONA = window.MIDAD_PERSONA;
  const KEYS = { chats: 'midad.chats.v1', projects: 'midad.projects.v1', docs: 'midad.docs.v1', settings: 'midad.settings.v1' };
  const safeRead = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
  const state = {
    page: 'home', activeChatId: null, activeProjectId: null, activeDocId: null,
    chats: safeRead(KEYS.chats, []), projects: safeRead(KEYS.projects, []), docs: safeRead(KEYS.docs, []),
    settings: { theme: 'dark', thinking: true, search: true, ...(safeRead(KEYS.settings, {})) },
    sending: false
  };
  const pageNames = { home: 'الرئيسية', chat: 'المساعد الذكي', stories: 'القصص والروايات', research: 'البحوث والدراسات', documents: 'المستندات', library: 'مكتبتي', templates: 'القوالب', settings: 'الإعدادات', project: 'مساحة المشروع', doc: 'محرر المستند' };
  const typeNames = { story: 'قصة / رواية', research: 'بحث / دراسة', document: 'مستند' };
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmtDate = value => new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value || Date.now()));
  const persist = () => {
    localStorage.setItem(KEYS.chats, JSON.stringify(state.chats));
    localStorage.setItem(KEYS.projects, JSON.stringify(state.projects));
    localStorage.setItem(KEYS.docs, JSON.stringify(state.docs));
    localStorage.setItem(KEYS.settings, JSON.stringify(state.settings));
    renderRecent();
  };
  const toast = (message, kind = '') => {
    const el = document.createElement('div'); el.className = `toast ${kind}`; el.textContent = message;
    $('#toastRegion').append(el); setTimeout(() => el.remove(), 3400);
  };
  const activeChat = () => state.chats.find(c => c.id === state.activeChatId);
  const activeProject = () => state.projects.find(p => p.id === state.activeProjectId);
  const activeDoc = () => state.docs.find(d => d.id === state.activeDocId);
  const setPage = page => { state.page = page; if (page !== 'project') state.activeProjectId = null; if (page !== 'doc') state.activeDocId = null; render(); closeSidebar(); };
  function applyTheme() { document.documentElement.dataset.theme = state.settings.theme; $('#themeToggle').textContent = state.settings.theme === 'dark' ? '☼' : '◐'; }
  function renderRecent() {
    const box = $('#sideRecent');
    const chats = [...state.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
    box.innerHTML = `<div class="side-label">الأخيرة</div>${chats.length ? chats.map(c => `<button class="recent-item" data-open-chat="${esc(c.id)}">${esc(c.title || 'محادثة جديدة')}</button>`).join('') : '<div class="recent-placeholder">ستظهر محادثاتك هنا</div>'}`;
  }
  function updateNav() {
    $$('.nav-link').forEach(b => b.classList.toggle('active', b.dataset.page === state.page || (state.page === 'project' && b.dataset.page === (activeProject()?.type === 'story' ? 'stories' : activeProject()?.type === 'research' ? 'research' : 'documents')) || (state.page === 'doc' && b.dataset.page === 'documents')));
    $('#currentCrumb').textContent = pageNames[state.page] || 'مِداد';
  }
  function openSidebar() { $('#sidebar').classList.add('open'); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); }

  function render() {
    applyTheme(); updateNav();
    const renderers = { home: renderHome, chat: renderChat, stories: () => renderProjectList('story'), research: () => renderProjectList('research'), documents: renderDocuments, library: renderLibrary, templates: renderTemplates, settings: renderSettings, project: renderProjectDetail, doc: renderDocDetail };
    (renderers[state.page] || renderHome)();
    renderRecent();
  }

  function renderHome() {
    const recent = [...state.projects].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,3);
    root.innerHTML = `
      <section class="hero hero-with-mascot"><div class="hero-inner">
        <div class="eyebrow">YOUR CREATIVE THINKING SPACE</div>
        <h1>الأفكار تبدأ هنا،<br><span>وتأخذ شكلها مع مِداد.</span></h1>
        <p class="lead">مساحة هادئة تجمع الكتابة والبحث والتفكير. اكتب فكرتك كما هي، وسنحوّلها معًا إلى قصة أو بحث أو عمل مكتمل.</p>
        <div class="hero-actions"><button class="btn btn-primary" data-action="new-chat">✳ ابدأ محادثة</button><button class="btn" data-action="create-story">＋ مشروع قصة</button><button class="btn btn-ghost" data-action="create-research">＋ مشروع بحث</button></div>
        <div class="mascot-inline-note"><span class="mascot-status-dot"></span><span>رِيشة هنا، رفيقك الصغير في رحلة الإبداع.</span></div>
      </div>
      <aside class="mascot-stage" aria-label="رِيشة، الشخصية المرئية لمِداد">
        <div class="mascot-glow"></div>
        <img class="mascot-art" src="/assets/midad-mascot-scene.png" alt="رِيشة، مخلوق صغير بعباءة يحمل ريشة وكتابًا" loading="eager">
        <div class="mascot-speech"><strong>أهلًا بك!</strong><span>احكِ لي فكرتك… وأنا أساعدك أن تمنحها شكلًا جميلًا.</span></div>
        <div class="mascot-signature"><span class="mascot-signature-dot">✦</span><span><strong>رِيشة</strong><small>رفيق مِداد الإبداعي</small></span></div>
      </aside></section>
      <div class="feature-grid">
        <button class="feature-card" data-page="chat"><span class="feature-icon">◌</span><strong>المساعد الذكي</strong><span>فكّر، اسأل، ناقش، واطلب المساعدة في أي موضوع.</span></button>
        <button class="feature-card" data-page="stories"><span class="feature-icon">▤</span><strong>القصص والروايات</strong><span>شخصيات وعوالم وفصول وحبكات مترابطة.</span></button>
        <button class="feature-card" data-page="research"><span class="feature-icon">⌕</span><strong>البحوث والدراسات</strong><span>خطط ومحاور وتحليل وصياغة منظمة.</span></button>
        <button class="feature-card" data-page="documents"><span class="feature-icon">▧</span><strong>محرر المستندات</strong><span>اكتب ونقّح واحفظ أعمالك في مكان واحد.</span></button>
      </div>
      <div class="section-head"><div><h2>مساحاتك الأخيرة</h2><p>تابع ما بدأت العمل عليه</p></div><button class="section-link" data-page="library">عرض المكتبة ←</button></div>
      ${recent.length ? `<div class="project-grid">${recent.map(projectCard).join('')}</div>` : `<div class="empty-state"><div class="empty-symbol">✧</div><h3>مساحتك الإبداعية جاهزة</h3><p>لم تنشئ أي مشروع بعد. ابدأ قصة أو بحثًا، وستجد أعمالك هنا محفوظة على جهازك.</p><button class="btn btn-primary btn-small" data-action="create-story">إنشاء أول مشروع</button></div>`}
      <div class="section-head"><div><h2>ابدأ من قالب</h2><p>نقطة انطلاق تساعدك على ترتيب الفكرة</p></div><button class="section-link" data-page="templates">كل القوالب ←</button></div>
      <div class="template-grid">${templateCard('✍','قصة قصيرة','بناء فكرة وشخصيات وعقدة ونهاية.','short-story')}${templateCard('▤','خطة بحث','سؤال بحث ومحاور ومنهجية أولية.','research-plan')}${templateCard('◈','مقال تحليلي','مقدمة وحجج وتحليل وخلاصة.','article')}</div>`;
  }
  function projectCard(p) {
    const meta = p.type === 'story' ? `${(p.chapters || []).length} فصول` : p.type === 'research' ? `${(p.sources || []).length} مصادر` : 'مستند';
    return `<article class="project-card"><div class="card-top"><span class="project-type">${typeNames[p.type] || 'مشروع'}</span><span class="tiny">${fmtDate(p.updatedAt)}</span></div><h3>${esc(p.title)}</h3><p>${esc(p.description || 'لا توجد ملاحظات إضافية لهذا المشروع بعد.')}</p><div class="project-meta"><span>${meta}</span><button class="card-open" data-open-project="${esc(p.id)}">فتح المشروع ←</button></div></article>`;
  }
  function templateCard(icon, title, desc, id) { return `<button class="template-card" data-template="${id}"><span class="feature-icon">${icon}</span><strong>${title}</strong><p>${desc}</p></button>`; }

  function startNewChat() {
    const chat = { id: uid(), title: 'محادثة جديدة', mode: 'chat', messages: [], parentMessageId: 12, createdAt: Date.now(), updatedAt: Date.now() };
    state.chats.unshift(chat); state.activeChatId = chat.id; state.page = 'chat'; persist(); render();
  }
  function renderChat() {
    if (!activeChat()) startNewChatSilently();
    const c = activeChat();
    root.innerHTML = `<div class="chat-layout">
      <section class="chat-main">
        <header class="chat-header"><div class="chat-header-title"><img class="assistant-avatar" src="/assets/midad-mascot-avatar.png" alt="رِيشة"><div><h3>مِداد <span class="chat-mascot-name">ورِيشة معه</span></h3><small>مساعدك للكتابة والبحث والتفكير</small></div></div><div class="chat-tools"><button class="icon-button" data-action="clear-chat" title="محادثة جديدة">＋</button><button class="icon-button" data-action="copy-chat" title="نسخ المحادثة">⧉</button></div></header>
        <div class="messages" id="messages">${c.messages.length ? c.messages.map(messageHtml).join('') : `<div class="welcome-chat"><div class="welcome-orb"><img src="/assets/midad-mascot-avatar.png" alt="رِيشة"></div><div class="eyebrow" style="justify-content:center">A THOUGHTFUL COMPANION</div><h2>أهلًا، أنا <span class="accent-text">مِداد</span>.</h2><p>أنا هنا لأساعدك على ترتيب أفكارك، وتطوير كتابتك، وبناء بحثك أو قصتك. ورِيشة رفيقي الصغير حاضر ليذكّرك أن كل فكرة عظيمة تبدأ بخطوة.</p><div class="suggestion-grid"><button class="suggestion" data-suggest="ساعدني في ابتكار فكرة رواية مميزة وبناء حبكتها.">أريد ابتكار رواية</button><button class="suggestion" data-suggest="ساعدني في إعداد خطة بحث منظمة عن موضوع أختاره.">أحتاج خطة بحث</button><button class="suggestion" data-suggest="راجع هذا النص وحسّن أسلوبه مع الحفاظ على معناه.">مراجعة نص وتحريره</button><button class="suggestion" data-suggest="أريد مناقشة فكرة وتطويرها من زوايا مختلفة.">لنطوّر فكرة معًا</button></div></div>`}</div>
        <div class="composer-wrap"><div class="mode-row">${[['chat','محادثة'],['story','كتابة إبداعية'],['research','بحث'],['document','تحرير']].map(([v,l])=>`<button class="mode-chip ${c.mode===v?'active':''}" data-mode="${v}">${l}</button>`).join('')}</div>
          <form class="composer" id="chatForm"><textarea id="chatInput" rows="1" placeholder="اكتب ما تفكر فيه..." aria-label="رسالتك"></textarea><button class="send-btn" id="sendBtn" type="submit" aria-label="إرسال">↑</button></form>
          <div class="composer-foot"><span>مِداد قد يخطئ؛ راجع المعلومات المهمة.</span><span>Enter للإرسال · Shift + Enter لسطر جديد</span></div></div>
      </section>
      <aside class="chat-side"><div class="mascot-side-card"><img src="/assets/midad-mascot-avatar.png" alt="رِيشة"><div><strong>رِيشة</strong><small>فضولي، لطيف، ويحب الأفكار الجديدة</small></div><span class="mascot-status-dot"></span><p>«هات فكرتك كما جاءت في بالك… لا تحتاج أن تكون مرتبة من البداية.»</p></div><h3>طريقة العمل</h3><p>اختر النمط الأقرب لمهمتك. ستتغير تعليمات مِداد وفق طبيعة العمل.</p>
        <button class="side-mode ${c.mode==='chat'?'active':''}" data-mode="chat"><span>◌</span>مساعد عام</button>
        <button class="side-mode ${c.mode==='story'?'active':''}" data-mode="story"><span>▤</span>كاتب ومحرر روائي</button>
        <button class="side-mode ${c.mode==='research'?'active':''}" data-mode="research"><span>⌕</span>مساعد بحثي</button>
        <button class="side-mode ${c.mode==='document'?'active':''}" data-mode="document"><span>▧</span>محرر نصوص</button>
        <div class="side-sep"></div><h3>إعدادات الإجابة</h3>
        <div class="switch-row"><span>التفكير المطوّل</span><input class="switch" type="checkbox" data-setting="thinking" ${state.settings.thinking?'checked':''}></div>
        <div class="switch-row"><span>البحث داخل الخدمة</span><input class="switch" type="checkbox" data-setting="search" ${state.settings.search?'checked':''}></div>
        <p class="tiny" style="margin:12px 0 0">البحث يعتمد على دعم الجلسة الداخلية لهذه الخاصية.</p>
      </aside>
    </div>`;
    scrollMessages();
  }
  function startNewChatSilently() { const c = { id: uid(), title: 'محادثة جديدة', mode: 'chat', messages: [], parentMessageId: 12, createdAt: Date.now(), updatedAt: Date.now() }; state.chats.unshift(c); state.activeChatId = c.id; persist(); }
  function messageHtml(m, i) {
    const user = m.role === 'user';
    return `<div class="message ${user?'user':'assistant'}">${user?'<div class="message-avatar user-message-avatar">أ</div>':'<img class="message-avatar mascot-message-avatar" src="/assets/midad-mascot-avatar.png" alt="رِيشة">'}<div class="message-body"><div class="message-name">${user?'أنت':'مِداد'}</div><div class="message-content">${esc(m.text || '')}</div>${!user?`<div class="message-actions"><button data-copy-message="${i}">نسخ النص</button></div>`:''}</div></div>`;
  }
  function scrollMessages() { const box = $('#messages'); if (box) box.scrollTop = box.scrollHeight; }
  async function sendMessage(text) {
    const chat = activeChat(); if (!chat || state.sending) return;
    const prompt = text.trim(); if (!prompt) return;
    chat.messages.push({ role: 'user', text: prompt, at: Date.now() });
    if (chat.title === 'محادثة جديدة') chat.title = prompt.slice(0, 38) + (prompt.length > 38 ? '…' : '');
    chat.updatedAt = Date.now(); state.sending = true; persist(); renderChat();
    const messagesBox = $('#messages');
    const typing = document.createElement('div'); typing.className = 'message assistant'; typing.id = 'typingIndicator'; typing.innerHTML = '<img class="message-avatar mascot-message-avatar" src="/assets/midad-mascot-avatar.png" alt="رِيشة"><div class="message-body"><div class="message-name">مِداد <span class="chat-mascot-name">ورِيشة يفكر</span></div><div class="typing"><i></i><i></i><i></i></div></div>';
    messagesBox?.append(typing); scrollMessages(); $('#sendBtn')?.setAttribute('disabled','disabled');
    try {
      const history = chat.messages.slice(-21, -1).map(m => ({ role: m.role, content: m.text }));
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        message: prompt, mode: chat.mode, history, parentMessageId: chat.parentMessageId,
        thinkingEnabled: !!state.settings.thinking, searchEnabled: !!state.settings.search,
        projectContext: projectContextForMode(chat.mode)
      }) });
      const rawText = await res.text();
      let payload; try { payload = JSON.parse(rawText); } catch { payload = { raw: rawText }; }
      if (!res.ok || payload.error) throw new Error(payload.error || `تعذر إكمال الطلب (HTTP ${res.status}).`);
      const answer = payload.answer || payload.text || payload.raw || rawText;
      chat.messages.push({ role: 'assistant', text: cleanAnswer(String(answer)), at: Date.now() });
      if (Number.isFinite(Number(payload.nextParentMessageId))) chat.parentMessageId = Number(payload.nextParentMessageId);
      chat.updatedAt = Date.now(); persist();
    } catch (err) {
      chat.messages.push({ role: 'assistant', text: `لم أتمكن من إكمال الطلب من الخادم.\n\nالتفاصيل: ${err.message}\n\nتحقق من تشغيل خادم مِداد وإعدادات الاتصال الخاصة به.`, at: Date.now(), error: true });
      persist();
    } finally { state.sending = false; renderChat(); }
  }
  function cleanAnswer(text) {
    let value = text.trim();
    if (value.startsWith('{') || value.startsWith('data:')) {
      try { const obj = JSON.parse(value); value = findAnswer(obj) || value; } catch { /* keep raw provider response */ }
    }
    return value;
  }
  function findAnswer(obj) {
    if (!obj || typeof obj !== 'object') return '';
    for (const key of ['answer','content','text','response','completion']) if (typeof obj[key] === 'string' && obj[key]) return obj[key];
    if (obj.message) { if (typeof obj.message === 'string') return obj.message; const nested = findAnswer(obj.message); if (nested) return nested; }
    for (const value of Object.values(obj)) { if (value && typeof value === 'object') { const nested = findAnswer(value); if (nested) return nested; } }
    return '';
  }
  function projectContextForMode(mode) {
    const p = activeProject();
    if (!p) return '';
    const parts = [`عنوان المشروع: ${p.title}`, `وصفه: ${p.description || 'غير محدد'}`];
    if (p.type === 'story') parts.push(`ملخص القصة: ${p.summary || ''}`, `الشخصيات: ${p.characters || ''}`, `العالم والأماكن: ${p.world || ''}`, `مخطط الفصول: ${p.outline || ''}`, `النص الحالي: ${(p.content || '').slice(-6000)}`);
    if (p.type === 'research') parts.push(`سؤال البحث: ${p.question || ''}`, `الخطة: ${p.plan || ''}`, `المصادر المدخلة: ${p.sources || ''}`, `مسودة البحث: ${(p.content || '').slice(-6000)}`);
    return parts.join('\n');
  }

  function renderProjectList(type) {
    const list = state.projects.filter(p => p.type === type).sort((a,b)=>b.updatedAt-a.updatedAt);
    const story = type === 'story';
    root.innerHTML = `<div class="eyebrow">${story?'FICTION WORKSPACE':'RESEARCH WORKSPACE'}</div><div class="section-head" style="margin-top:8px"><div><h1>${story?'القصص والروايات':'البحوث والدراسات'}</h1><p>${story?'حوّل الفكرة إلى عالم وشخصيات وأحداث وفصول.':'نظّم سؤالك ومحاورك وملاحظاتك ومصادرك في مساحة واحدة.'}</p></div><button class="btn btn-primary" data-action="${story?'create-story':'create-research'}">＋ ${story?'قصة جديدة':'بحث جديد'}</button></div>
      ${list.length ? `<div class="project-grid">${list.map(projectCard).join('')}</div>` : `<div class="empty-state"><div class="empty-symbol">${story?'▤':'⌕'}</div><h3>${story?'لم تبدأ روايتك بعد':'لا توجد بحوث محفوظة'}</h3><p>${story?'أنشئ مشروعًا، ثم احفظ فيه ملخص القصة وشخصياتها ومخطط فصولها ونصها.':'ابدأ بسؤال واضح، ثم ابنِ خطة البحث وأضف المصادر والمسودة.'}</p><button class="btn btn-primary btn-small" data-action="${story?'create-story':'create-research'}">إنشاء ${story?'قصة':'بحث'}</button></div>`}`;
  }

  function createProject(type, values) {
    const p = { id: uid(), type, title: values.title.trim(), description: values.description.trim(), createdAt: Date.now(), updatedAt: Date.now(), content: '', summary: '', characters: '', world: '', outline: '', chapters: [], question: '', plan: '', sources: '' };
    if (type === 'research') { p.question = values.question || ''; p.plan = values.plan || ''; }
    state.projects.unshift(p); state.activeProjectId = p.id; state.page = 'project'; persist(); closeModal(); render(); toast('تم إنشاء المشروع وحفظه على هذا الجهاز.', 'success');
  }
  function renderProjectDetail() {
    const p = activeProject(); if (!p) { state.page = 'home'; render(); return; }
    const isStory = p.type === 'story';
    root.innerHTML = `<div class="eyebrow">${isStory?'STORY BIBLE & MANUSCRIPT':'RESEARCH FILE'}</div><div class="section-head" style="margin-top:8px;align-items:center"><div><h1>${esc(p.title)}</h1><p>${esc(p.description || (isStory?'مساحة تطوير الرواية':'مساحة إعداد البحث'))}</p></div><div class="toolbar-row"><button class="btn btn-ghost btn-small" data-action="delete-project">حذف المشروع</button><button class="btn btn-small" data-action="ask-about-project">مناقشة مع مِداد ↗</button></div></div>
      <div class="workspace"><aside class="workspace-panel"><h3>${isStory?'دليل الرواية':'خطة البحث'}</h3>
        ${isStory?`<button class="outline-item active" data-scroll="projectEditor">✎ النص والمخطوط</button><button class="outline-item" data-scroll="summaryField">ملخص القصة</button><button class="outline-item" data-scroll="charactersField">الشخصيات</button><button class="outline-item" data-scroll="worldField">العالم والأماكن</button><button class="outline-item" data-scroll="outlineField">مخطط الفصول</button>`:`<button class="outline-item active" data-scroll="projectEditor">✎ مسودة البحث</button><button class="outline-item" data-scroll="questionField">سؤال البحث</button><button class="outline-item" data-scroll="planField">الخطة والمحاور</button><button class="outline-item" data-scroll="sourcesField">المصادر</button>`}
        <div class="divider"></div><p class="tiny">يُحفظ النص تلقائيًا على هذا الجهاز عند التعديل.</p><span class="pill good">حفظ محلي</span>
      </aside><section class="editor-panel"><div class="editor-toolbar"><button class="tool-btn" data-action="save-project">حفظ الآن</button><button class="tool-btn" data-action="copy-project">نسخ النص</button><button class="tool-btn" data-action="download-project">تنزيل TXT</button><button class="tool-btn" data-action="send-project-chat">إرسال للمساعد</button></div>
        ${isStory?`<div class="field"><label>ملخص القصة</label><textarea id="summaryField" data-project-field="summary" placeholder="الفكرة الأساسية، الصراع، والاتجاه العام...">${esc(p.summary)}</textarea></div><div class="form-grid"><div class="field"><label>الشخصيات</label><textarea id="charactersField" data-project-field="characters" placeholder="الأسماء، الدوافع، الصفات، العلاقات...">${esc(p.characters)}</textarea></div><div class="field"><label>العالم والأماكن</label><textarea id="worldField" data-project-field="world" placeholder="الزمن، المكان، القواعد، والتفاصيل...">${esc(p.world)}</textarea></div></div><div class="field"><label>مخطط الفصول والأحداث</label><textarea id="outlineField" data-project-field="outline" placeholder="الفصل الأول...\nالفصل الثاني...">${esc(p.outline)}</textarea></div>`:`<div class="field"><label>سؤال البحث</label><textarea id="questionField" data-project-field="question" placeholder="ما السؤال الذي يحاول البحث الإجابة عنه؟">${esc(p.question)}</textarea></div><div class="field"><label>الخطة والمحاور</label><textarea id="planField" data-project-field="plan" placeholder="مقدمة، مباحث، مطالب، منهجية...">${esc(p.plan)}</textarea></div><div class="field"><label>المصادر والمراجع التي أضفتها</label><textarea id="sourcesField" data-project-field="sources" placeholder="أضف أسماء المصادر وروابطها وملاحظاتك. لا تُنشأ مراجع تلقائيًا.">${esc(p.sources)}</textarea></div>`}
        <div class="divider"></div><div class="field"><label>النص الرئيسي</label><div class="editor-toolbar"><button class="tool-btn" data-insert="\n\nعنوان جديد\n">عنوان</button><button class="tool-btn" data-insert="\n\n">فقرة جديدة</button><button class="tool-btn" data-insert="— ">فاصل</button><button class="tool-btn" data-action="word-count">عدد الكلمات</button></div><textarea class="editor-area" id="projectEditor" data-project-field="content" placeholder="ابدأ الكتابة هنا...">${esc(p.content)}</textarea><div class="editor-footer"><span>آخر تحديث: ${fmtDate(p.updatedAt)}</span><span id="projectWordCount">${wordCount(p.content)} كلمة</span></div></div>
      </section></div>`;
  }
  function wordCount(text) { return String(text || '').trim() ? String(text).trim().split(/\s+/).length : 0; }

  function renderDocuments() {
    const docs = [...state.docs].sort((a,b)=>b.updatedAt-a.updatedAt);
    root.innerHTML = `<div class="eyebrow">DOCUMENT WORKSPACE</div><div class="section-head" style="margin-top:8px"><div><h1>المستندات</h1><p>مساحة للكتابة الحرة وتحرير النصوص وحفظ المسودات.</p></div><button class="btn btn-primary" data-action="create-doc">＋ مستند جديد</button></div>
    ${docs.length?`<div class="project-grid">${docs.map(d=>`<article class="project-card"><div class="card-top"><span class="project-type">مستند</span><span class="tiny">${fmtDate(d.updatedAt)}</span></div><h3>${esc(d.title)}</h3><p>${esc((d.content||'').slice(0,100) || 'مستند فارغ جاهز للكتابة.')}</p><div class="project-meta"><span>${wordCount(d.content)} كلمة</span><button class="card-open" data-open-doc="${esc(d.id)}">فتح المستند ←</button></div></article>`).join('')}</div>`:`<div class="empty-state"><div class="empty-symbol">▧</div><h3>ابدأ مستندك الأول</h3><p>اكتب مسودة أو مقالًا أو ملاحظة، وسيتم حفظها تلقائيًا على جهازك.</p><button class="btn btn-primary btn-small" data-action="create-doc">إنشاء مستند</button></div>`}`;
  }
  function createDoc(title = 'مستند جديد', content = '') { const d = { id: uid(), title, content, createdAt: Date.now(), updatedAt: Date.now() }; state.docs.unshift(d); state.activeDocId = d.id; state.page = 'doc'; persist(); render(); toast('تم إنشاء المستند.', 'success'); }
  function renderDocDetail() {
    const d = activeDoc(); if (!d) { state.page = 'documents'; render(); return; }
    root.innerHTML = `<div class="eyebrow">DOCUMENT EDITOR</div><div class="section-head" style="margin-top:8px"><div><h1>محرر المستند</h1><p>اكتب بحرية. يتم حفظ التغييرات محليًا على جهازك.</p></div><div class="toolbar-row"><button class="btn btn-ghost btn-small" data-action="delete-doc">حذف</button><button class="btn btn-small" data-action="download-doc">تنزيل TXT</button></div></div>
    <section class="editor-panel"><div class="field"><label>عنوان المستند</label><input id="docTitle" value="${esc(d.title)}" placeholder="عنوان المستند"></div><div class="editor-toolbar"><button class="tool-btn" data-doc-insert="\n\nعنوان فرعي\n">عنوان فرعي</button><button class="tool-btn" data-doc-insert="\n\n">فقرة جديدة</button><button class="tool-btn" data-action="copy-doc">نسخ النص</button></div><textarea class="editor-area" id="docEditor" placeholder="اكتب هنا...">${esc(d.content)}</textarea><div class="editor-footer"><span>حفظ تلقائي</span><span id="docWordCount">${wordCount(d.content)} كلمة</span></div></section>`;
  }
  function renderLibrary() {
    const entries = [
      ...state.projects.map(p=>({id:p.id,title:p.title,kind:typeNames[p.type]||'مشروع',date:p.updatedAt,open:'data-open-project',icon:p.type==='story'?'▤':p.type==='research'?'⌕':'▧'})),
      ...state.docs.map(d=>({id:d.id,title:d.title,kind:'مستند',date:d.updatedAt,open:'data-open-doc',icon:'▧'})),
      ...state.chats.map(c=>({id:c.id,title:c.title,kind:'محادثة',date:c.updatedAt,open:'data-open-chat',icon:'◌'}))
    ].sort((a,b)=>b.date-a.date);
    root.innerHTML = `<div class="eyebrow">YOUR LIBRARY</div><div class="section-head" style="margin-top:8px"><div><h1>مكتبتي</h1><p>كل ما أنشأته في مِداد، مرتبًا بحسب آخر تعديل.</p></div><span class="pill">${entries.length} عنصر</span></div><div class="toolbar-row" style="margin-bottom:14px"><input class="search-input" id="librarySearch" placeholder="ابحث في مكتبتك..."></div><div class="library-list" id="libraryList">${entries.length?entries.map(e=>`<div class="library-row" data-library-item="${esc((e.title+' '+e.kind).toLowerCase())}"><span class="feature-icon">${e.icon}</span><div class="library-info"><strong>${esc(e.title)}</strong><small>${e.kind} · ${fmtDate(e.date)}</small></div><button ${e.open}="${esc(e.id)}">فتح ←</button></div>`).join(''):'<div class="empty-state"><div class="empty-symbol">▥</div><h3>مكتبتك فارغة الآن</h3><p>أنشئ مشروعًا أو محادثة، وستظهر هنا تلقائيًا.</p></div>'}</div>`;
  }
  function renderTemplates() {
    const templates = [
      ['✍','قصة قصيرة','فكرة، بطل، صراع، ذروة، ونهاية.','short-story'],['▤','رواية طويلة','ملف شخصيات وعالم ومخطط فصول.','novel'],['◈','خيال علمي','فرضية علمية وعالم مستقبلي متماسك.','scifi'],['⌕','خطة بحث','مشكلة البحث وأسئلته ومحاوره ومنهجيته.','research-plan'],['▦','بحث تاريخي','سياق زمني وشخصيات وأحداث ومصادر.','history'],['▧','مقال تحليلي','أطروحة وحجج وأدلة وتحليل وخاتمة.','article'],['▤','تقرير','هدف ونطاق ونتائج وتوصيات.','report'],['✧','عصف ذهني','مجموعة أفكار وزوايا وأسئلة تطوير.','ideas'],['✎','مراجعة نص','تحرير لغوي وأسلوب مع الحفاظ على المعنى.','edit']
    ];
    root.innerHTML = `<div class="eyebrow">START WITH A TEMPLATE</div><div class="section-head" style="margin-top:8px"><div><h1>القوالب</h1><p>اختر نقطة بداية، ثم عدّلها لتناسب مشروعك.</p></div></div><div class="template-grid">${templates.map(([ic,t,d,id])=>`<button class="template-card" data-template="${id}"><span class="feature-icon">${ic}</span><strong>${t}</strong><p>${d}</p></button>`).join('')}</div>`;
  }
  function renderSettings() {
    root.innerHTML = `<div class="eyebrow">PREFERENCES & CONNECTION</div><div class="section-head" style="margin-top:8px"><div><h1>الإعدادات</h1><p>تحكم في مظهر مِداد وطريقة عمل مساعدك.</p></div></div><div class="settings-grid">
      <section class="settings-card"><h3>هوية مِداد</h3><p>مِداد رفيق معرفي ومحرر إبداعي وباحث منهجي. شخصيته وتعليماته مضمّنة في كل طلب يرسله الموقع إلى الخادم.</p><div class="status-line"><span class="status-dot" style="background:var(--lime)"></span> الشخصية مفعّلة داخل التطبيق</div><div class="divider"></div><div class="field"><label>الاسم</label><input value="مِداد | MIDĀD" readonly></div><div class="field"><label>الأسلوب الأساسي</label><textarea readonly>هادئ، واضح، دقيق، أدبي عند الإبداع، ومنهجي عند البحث. لا يختلق المصادر ولا يدّعي ما لم ينفذه.</textarea></div><button class="btn btn-small" data-action="show-persona">عرض مبادئ الشخصية</button></section>
      <section class="settings-card"><h3>اتصال DeepSeek</h3><p>الموقع يرسل الطلب من خلال خادم مِداد، ولا يضع بيانات الجلسة في المتصفح.</p><div class="status-line"><span class="status-dot"></span> إعداد اتصال الجلسة الداخلية على الخادم</div><div class="divider"></div><div class="field"><label>نقطة الاتصال</label><input value="chat.deepseek.com/api/v0/chat/completion" readonly></div><div class="warning-note">هذه نقطة اتصال داخلية مرتبطة بجلسة موقع DeepSeek، وليست واجهة API عامة. بياناتها محفوظة في إعدادات الخادم فقط. لم يتم إرسال طلب اختبار.</div><div style="margin-top:13px"><button class="btn btn-small" data-action="connection-info">تفاصيل الإعداد</button></div></section>
      <section class="settings-card"><h3>المظهر</h3><p>اختر الثيم المناسب لبيئة الكتابة.</p><div class="switch-row"><span>المظهر الفاتح</span><input class="switch" type="checkbox" data-setting="lightTheme" ${state.settings.theme==='light'?'checked':''}></div><div class="switch-row"><span>التفكير المطوّل افتراضيًا</span><input class="switch" type="checkbox" data-setting="thinking" ${state.settings.thinking?'checked':''}></div><div class="switch-row"><span>البحث داخل خدمة DeepSeek</span><input class="switch" type="checkbox" data-setting="search" ${state.settings.search?'checked':''}></div></section>
      <section class="settings-card"><h3>البيانات والتخزين</h3><p>المحادثات والمشاريع والمستندات محفوظة في مساحة التخزين المحلية للمتصفح على هذا الجهاز، ولا توجد مزامنة سحابية مفعّلة في هذه النسخة.</p><div class="info-strip"><span>المحادثات: ${state.chats.length}</span><span>المشاريع: ${state.projects.length}</span><span>المستندات: ${state.docs.length}</span></div><div class="divider"></div><button class="btn btn-danger btn-small" data-action="clear-local">مسح بيانات هذا الجهاز</button></section>
    </div>`;
  }

  function showModal(title, body, onSubmit) {
    modalLayer.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>${title}</h3><button class="modal-close" type="button" data-action="close-modal">×</button></div>${body}</div>`;
    modalLayer.classList.add('open'); modalLayer.setAttribute('aria-hidden','false');
    const form = $('form', modalLayer); if (form && onSubmit) form.addEventListener('submit', e => { e.preventDefault(); onSubmit(new FormData(form)); });
  }
  function closeModal() { modalLayer.classList.remove('open'); modalLayer.setAttribute('aria-hidden','true'); modalLayer.innerHTML = ''; }
  function projectModal(type) {
    const story = type === 'story';
    showModal(story?'إنشاء قصة أو رواية':'إنشاء بحث جديد', `<form id="createProjectForm"><div class="field"><label>عنوان المشروع</label><input name="title" required maxlength="90" placeholder="${story?'اسم الرواية أو القصة':'عنوان البحث'}"></div><div class="field"><label>وصف مختصر</label><textarea name="description" placeholder="ما الفكرة أو الهدف من المشروع؟"></textarea></div>${story?'':`<div class="field"><label>سؤال البحث</label><textarea name="question" placeholder="ما السؤال الأساسي الذي تريد الإجابة عنه؟"></textarea></div><div class="field"><label>خطة أولية (اختياري)</label><textarea name="plan" placeholder="المقدمة والمحاور والمنهجية..."></textarea></div>`}<div class="form-actions"><button class="btn btn-primary" type="submit">إنشاء المشروع</button><button class="btn btn-ghost" type="button" data-action="close-modal">إلغاء</button></div></form>`, fd => createProject(type, Object.fromEntries(fd.entries())));
  }
  function templateAction(id) {
    const templates = {
      'short-story': ['قصة قصيرة جديدة','story','فكرة أولية لقصة قصيرة'], 'novel':['رواية جديدة','story','مشروع رواية طويل الأمد'], 'scifi':['قصة خيال علمي','story','بناء فرضية علمية وعالم مستقبلي'],
      'research-plan':['بحث جديد','research','خطة بحث منظمة'], 'history':['بحث تاريخي','research','دراسة حدث أو حقبة تاريخية'], 'article':['مقال تحليلي','document','مقال قائم على أطروحة وحجج'],
      'report':['تقرير جديد','document','تقرير منظم'], 'ideas':['جلسة عصف ذهني','chat','تطوير مجموعة أفكار'], 'edit':['مراجعة نص','chat','مراجعة نص وتحسينه']
    };
    const t = templates[id]; if (!t) return;
    if (t[1] === 'story' || t[1] === 'research') { projectModal(t[1]); setTimeout(()=>{ const title=$('input[name="title"]',modalLayer); if(title) title.value=t[0]; const desc=$('textarea[name="description"]',modalLayer); if(desc) desc.value=t[2]; },0); }
    else if (t[1] === 'document') createDoc(t[0], '');
    else { startNewChat(); const input=$('#chatInput'); if(input) input.value = t[2] + '، ساعدني على تطويرها.'; }
  }

  function openProject(id) { state.activeProjectId=id; state.page='project'; render(); }
  function openDoc(id) { state.activeDocId=id; state.page='doc'; render(); }
  function openChat(id) { state.activeChatId=id; state.page='chat'; render(); }
  function updateProjectField(el) { const p=activeProject(); if (!p) return; p[el.dataset.projectField]=el.value; p.updatedAt=Date.now(); persist(); const wc=$('#projectWordCount'); if(wc) wc.textContent=`${wordCount(p.content)} كلمة`; }
  function insertAtCursor(el, value) { if(!el)return; const start=el.selectionStart ?? el.value.length, end=el.selectionEnd ?? el.value.length; el.value=el.value.slice(0,start)+value+el.value.slice(end); el.focus(); el.selectionStart=el.selectionEnd=start+value.length; el.dispatchEvent(new Event('input',{bubbles:true})); }
  function downloadText(filename, text) { const blob=new Blob([text],{type:'text/plain;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
  async function copyText(text) { try { await navigator.clipboard.writeText(text); toast('تم النسخ.','success'); } catch { toast('تعذر النسخ من المتصفح الحالي.','error'); } }

  document.addEventListener('click', async e => {
    const pageBtn=e.target.closest('[data-page]'); if(pageBtn){e.preventDefault();setPage(pageBtn.dataset.page);return;}
    const action=e.target.closest('[data-action]')?.dataset.action;
    if(action){
      switch(action){
        case 'new-chat': startNewChat(); break;
        case 'create-story': projectModal('story'); break;
        case 'create-research': projectModal('research'); break;
        case 'create-doc': createDoc(); break;
        case 'close-modal': closeModal(); break;
        case 'clear-chat': startNewChat(); break;
        case 'copy-chat': {const c=activeChat();copyText(c?.messages.map(m=>`${m.role==='user'?'أنت':'مِداد'}:\n${m.text}`).join('\n\n')||'');break;}
        case 'delete-project': {const p=activeProject();if(p&&confirm('هل تريد حذف هذا المشروع نهائيًا من هذا الجهاز؟')){state.projects=state.projects.filter(x=>x.id!==p.id);state.page=p.type==='story'?'stories':p.type==='research'?'research':'documents';state.activeProjectId=null;persist();render();toast('تم حذف المشروع.');}break;}
        case 'save-project': persist();toast('تم حفظ المشروع.','success');break;
        case 'copy-project': {const p=activeProject();if(p)copyText([p.summary,p.characters,p.world,p.outline,p.question,p.plan,p.sources,p.content].filter(Boolean).join('\n\n'));break;}
        case 'download-project': {const p=activeProject();if(p)downloadText(`${p.title||'midad-project'}.txt`,[p.title,p.description,p.summary,p.characters,p.world,p.outline,p.question,p.plan,p.sources,p.content].filter(Boolean).join('\n\n'));break;}
        case 'ask-about-project': {const p=activeProject();startNewChat();const c=activeChat();c.mode=p?.type==='story'?'story':p?.type==='research'?'research':'document';const inp=$('#chatInput');if(inp)inp.value=`أريد العمل على مشروعي «${p?.title}». ساعدني في تطويره مع الالتزام بتفاصيله المحفوظة.`;renderChat();break;}
        case 'send-project-chat': {const p=activeProject();startNewChat();const c=activeChat();c.mode=p?.type==='story'?'story':'research';renderChat();const inp=$('#chatInput');if(inp)inp.value=`راجع مشروعي «${p?.title}» واقترح الخطوة التالية.`;break;}
        case 'word-count': {const p=activeProject();toast(`النص الرئيسي يحتوي على ${wordCount(p?.content)} كلمة.`);break;}
        case 'delete-doc': {const d=activeDoc();if(d&&confirm('هل تريد حذف المستند؟')){state.docs=state.docs.filter(x=>x.id!==d.id);state.page='documents';state.activeDocId=null;persist();render();}break;}
        case 'download-doc': {const d=activeDoc();if(d)downloadText(`${d.title||'document'}.txt`,d.content);break;}
        case 'copy-doc': {const d=activeDoc();if(d)copyText(d.content);break;}
        case 'show-persona': showModal('مبادئ شخصية مِداد', `<div class="reading-content"><p>مِداد رفيق معرفي ومحرر إبداعي وباحث منهجي. هادئ وواضح، يحترم صوت الكاتب، ويميز بين الحقيقة والتحليل والرأي.</p><ul><li>لا يختلق المصادر أو الاقتباسات.</li><li>يحافظ على سياق المشروع وتفاصيله.</li><li>يتكيف مع طبيعة المهمة.</li><li>يعترف بحدود معرفته ولا يدعي تنفيذ ما لم ينفذه.</li><li>يقدم إجابات مكتملة دون حشو.</li></ul></div>`);break;
        case 'connection-info': showModal('تفاصيل اتصال DeepSeek', `<div class="reading-content"><p>يُرسل الموقع الطلب من خلال <code>/api/chat</code> إلى الخادم المحلي، ويُنشئ الخادم طلب POST إلى نقطة الاتصال التي زودتني بها، مع الرؤوس ومعرّف الجلسة ومعاملات الطلب المحددة في إعداداته.</p><p>بيانات المصادقة لا تُرسل إلى المتصفح. لا يوجد اختبار اتصال تلقائي من هذه الصفحة.</p><p>يتطلب تشغيل الخادم Node.js 18 أو أحدث.</p></div>`);break;
        case 'clear-local': if(confirm('سيتم حذف كل المحادثات والمشاريع والمستندات والإعدادات المخزنة على هذا الجهاز. هل تريد المتابعة؟')){Object.values(KEYS).forEach(k=>localStorage.removeItem(k));state.chats=[];state.projects=[];state.docs=[];state.settings={theme:'dark',thinking:true,search:true};state.page='home';state.activeChatId=null;persist();render();toast('تم مسح البيانات المحلية.');}break;
      }
      return;
    }
    const openP=e.target.closest('[data-open-project]');if(openP){openProject(openP.dataset.openProject);return;}
    const openD=e.target.closest('[data-open-doc]');if(openD){openDoc(openD.dataset.openDoc);return;}
    const openC=e.target.closest('[data-open-chat]');if(openC){openChat(openC.dataset.openChat);return;}
    const mode=e.target.closest('[data-mode]');if(mode){const c=activeChat();if(c){c.mode=mode.dataset.mode;persist();renderChat();}return;}
    const sug=e.target.closest('[data-suggest]');if(sug){sendMessage(sug.dataset.suggest);return;}
    const tmpl=e.target.closest('[data-template]');if(tmpl){templateAction(tmpl.dataset.template);return;}
    const ins=e.target.closest('[data-insert]');if(ins){insertAtCursor($('#projectEditor'),ins.dataset.insert);return;}
    const docIns=e.target.closest('[data-doc-insert]');if(docIns){insertAtCursor($('#docEditor'),docIns.dataset.docInsert);return;}
    const scroll=e.target.closest('[data-scroll]');if(scroll){document.getElementById(scroll.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'center'});return;}
    const copyMsg=e.target.closest('[data-copy-message]');if(copyMsg){const c=activeChat();copyText(c?.messages[Number(copyMsg.dataset.copyMessage)]?.text||'');return;}
  });

  document.addEventListener('submit', e => { if(e.target.id==='chatForm'){e.preventDefault();const input=$('#chatInput');const value=input.value;input.value='';sendMessage(value); } });
  document.addEventListener('keydown', e => { if(e.target.id==='chatInput' && e.key==='Enter' && !e.shiftKey){e.preventDefault();$('#chatForm')?.requestSubmit();} if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();startNewChat();} if(e.key==='Escape'&&modalLayer.classList.contains('open'))closeModal(); });
  document.addEventListener('input', e => {
    if(e.target.matches('[data-project-field]')) updateProjectField(e.target);
    if(e.target.id==='docTitle'){const d=activeDoc();if(d){d.title=e.target.value;d.updatedAt=Date.now();persist();}}
    if(e.target.id==='docEditor'){const d=activeDoc();if(d){d.content=e.target.value;d.updatedAt=Date.now();persist();const wc=$('#docWordCount');if(wc)wc.textContent=`${wordCount(d.content)} كلمة`;}}
    if(e.target.id==='librarySearch'){const q=e.target.value.trim().toLowerCase();$$('[data-library-item]').forEach(el=>el.hidden=!el.dataset.libraryItem.includes(q));}
    if(e.target.id==='chatInput'){e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,155)+'px';}
  });
  document.addEventListener('change', e => { if(e.target.matches('[data-setting]')){const key=e.target.dataset.setting;if(key==='lightTheme')state.settings.theme=e.target.checked?'light':'dark';else state.settings[key]=e.target.checked;persist();applyTheme();if(state.page==='chat')renderChat();} });

  $('#newChatBtn').addEventListener('click', startNewChat);
  $('#mobileMenu').addEventListener('click', openSidebar);
  $('#closeSidebar').addEventListener('click', closeSidebar);
  $('#themeToggle').addEventListener('click',()=>{state.settings.theme=state.settings.theme==='dark'?'light':'dark';persist();applyTheme();});
  modalLayer.addEventListener('click',e=>{if(e.target===modalLayer)closeModal();});
  applyTheme(); render();
})();
