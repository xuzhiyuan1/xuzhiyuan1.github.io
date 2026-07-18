/* ============================================================
   小王子 · 悬浮助手
   功能:
     1. 浮动按钮 + 聊天面板
     2. 快捷问答(本地规则,无需后端)
     3. AI 总结菜谱(调用可配置的 aiEndpoint,失败回退到本地摘要)
     4. 图片上传(调用可配置的 uploadEndpoint,失败回退到本地 base64)
   配置:
     window.__RECIPE_CONFIG__ = {
       aiEndpoint:    "https://your-ai.example.com/chat",   // 可选
       uploadEndpoint:"https://your-storage.example.com/upload", // 可选
       authToken:     "Bearer xxx"  // 可选
     }
   ============================================================ */

(function () {
  'use strict';

  // ---------- 配置 ----------
  var CFG = Object.assign({
    aiEndpoint: '',
    uploadEndpoint: '',
    authToken: ''
  }, (typeof window !== 'undefined' && window.__RECIPE_CONFIG__) || {});

  // ---------- 持久化 ----------
  var LS_KEY = 'recipe.prince.v1';
  function loadState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveState(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  // ---------- DOM 创建 ----------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  // ---------- 本地规则 ----------
  var state = loadState();
  if (!state.history) state.history = [];
  if (!state.uploads) state.uploads = [];

  function pushHistory(role, text) {
    state.history.push({ role: role, text: text, at: Date.now() });
    if (state.history.length > 50) state.history.shift();
    saveState(state);
  }

  // 关键词 → 答复
  var RULES = [
    { match: /(怎么|如何).*(添加|新增|录入).*(菜|食谱)/,
      reply: '录入新菜谱三步走:\n1) 在 _data/ 下新建 菜名拼音.json(可参考 _data/qingjiao-chaopaigu.json 的结构)\n2) 在分类页 _data/categories.json 中对应分类的 recipes 列表里挂上(或者在分类页用 JS 自动发现)\n3) 在对应分类目录下新建 菜名拼音/index.html 渲染详情(详情页里已写好 JSON 加载逻辑,直接复用即可)\n你也可以直接告诉我"添加:菜名 + 食材 + 步骤",小王子帮你整理成标准 JSON 草稿。' },

    { match: /(啤酒|1982)/,
      reply: '青椒炒排骨这道菜的精髓就是啤酒。推荐选用 1982 黄色款,度数偏高,焖煮时麦香更浓,出来的排骨特别入味。' },

    { match: /(青椒|排骨|青椒炒排骨)/,
      reply: '青椒炒排骨是小王子记录的第一道菜!核心要点:\n• 生姜要煎到金黄再下排骨\n• 加小米辣的步骤同时加盐\n• 一罐啤酒(1982 黄)是中火转大火焖 15 分钟\n• 出锅前加青椒和蚝油\n详情见 /chaocai/qingjiao-chaopaigu/' },

    { match: /(总结|摘要|整理)/,
      reply: '把你想总结的菜谱内容(食材、步骤、注意事项)发给我,我可以帮你:\n• 提炼食材清单\n• 把口语化步骤改写成标准化步骤\n• 生成一句话简介和标签\n点击下方的 "📋 总结当前页面" 按钮,小王子会直接读取当前菜谱页并生成摘要。' },

    { match: /(图片|上传|照片)/,
      reply: '小王子支持图片上传:\n• 默认上传到 window.__RECIPE_CONFIG__.uploadEndpoint 配置的后端(不依赖 GitHub)\n• 若后端未配置,图片会以 base64 形式暂存在浏览器本地,刷新不丢失\n• 上传后,我会告诉你图片的访问地址或本地预览\n点击下方 📷 上传图片 按钮即可。' },

    { match: /(你好|hi|hello|嗨|在吗)/,
      reply: '你好呀 👋 我是小王子,可以帮你:\n• 录入 / 总结 / 修改菜谱\n• 上传图片(默认存到你的后端,不上 GitHub)\n• 解答菜谱相关问题\n试着点下方快捷按钮,或直接打字给我吧~' },

    { match: /(功能|你能做什么|你会什么)/,
      reply: '我能帮你:\n1. 📋 总结菜谱 — 把口语化描述整理成标准模板\n2. ➕ 起草菜谱 — 你说,我帮你转成 JSON\n3. 🖼️ 上传图片 — 配图存在你的后端\n4. ❓ 解答烹饪疑问 — 比如啤酒选哪款、青椒什么时候下…\n提示:本助手不需要后端也能工作,但配上后端就能用 AI 总结、上传真图片。' }
  ];

  function localReply(text) {
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i].match.test(text)) return RULES[i].reply;
    }
    return '这条暂时没找到现成答案 😅\n你可以问我:\n• "青椒炒排骨怎么做的"\n• "啤酒为什么要选 1982"\n• "怎么添加新菜谱"\n• 或者直接说 "总结:..." 让小王子帮你整理。';
  }

  // ---------- 调用 AI 后端 ----------
  async function callAI(messages) {
    if (!CFG.aiEndpoint) throw new Error('no-ai-endpoint');
    var resp = await fetch(CFG.aiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CFG.authToken ? { 'Authorization': CFG.authToken } : {})
      },
      body: JSON.stringify({
        messages: messages,
        system: '你是"小王子",一个温暖简洁的菜谱助手。回答控制在 200 字以内,优先用要点列表。'
      })
    });
    if (!resp.ok) throw new Error('ai-http-' + resp.status);
    var data = await resp.json();
    return data.reply || data.answer || data.message || JSON.stringify(data);
  }

  // ---------- 总结当前页 ----------
  function summarizeCurrentPage() {
    var data = window.__CURRENT_RECIPE__;
    if (!data) return '当前页面没有可总结的菜谱数据。';
    var lines = [];
    lines.push('【' + (data.name || '未命名') + '】');
    if (data.summary) lines.push('简介:' + data.summary);
    if (data.tags && data.tags.length) lines.push('标签:' + data.tags.join('、'));
    if (data.ingredients && data.ingredients.length) {
      lines.push('食材:');
      data.ingredients.forEach(function (it) {
        lines.push('• ' + it.name + (it.amount ? ' (' + it.amount + ')' : ''));
      });
    }
    if (data.steps && data.steps.length) {
      lines.push('步骤:');
      data.steps.forEach(function (s, i) {
        lines.push((i + 1) + '. ' + (s.title ? s.title + ' — ' : '') + (s.desc || ''));
      });
    }
    if (data.tips && data.tips.length) {
      lines.push('小贴士:');
      data.tips.forEach(function (t) { lines.push('• ' + t); });
    }
    return lines.join('\n');
  }

  // ---------- 上传图片 ----------
  async function uploadOne(file) {
    // 1) 尝试后端
    if (CFG.uploadEndpoint) {
      try {
        var fd = new FormData();
        fd.append('file', file);
        var resp = await fetch(CFG.uploadEndpoint, {
          method: 'POST',
          headers: CFG.authToken ? { 'Authorization': CFG.authToken } : {},
          body: fd
        });
        if (resp.ok) {
          var data = await resp.json();
          return { url: data.url || data.path || data.href, local: false };
        }
      } catch (e) { /* fallthrough */ }
    }
    // 2) 回退 base64 localStorage
    return await new Promise(function (resolve) {
      var r = new FileReader();
      r.onload = function () {
        var id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        state.uploads.push({ id: id, name: file.name, data: r.result, at: Date.now() });
        saveState(state);
        resolve({ url: r.result, local: true, id: id });
      };
      r.readAsDataURL(file);
    });
  }

  // ---------- UI 渲染 ----------
  function buildUI() {
    // 浮动按钮
    var fab = el('button', { class: 'prince-fab', 'aria-label': '打开小王子', title: '小王子' }, [
      el('span', { class: 'face', text: '👑' })
    ]);
    fab.addEventListener('click', function () {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        setTimeout(function () { ta.focus(); }, 50);
      }
    });

    // 面板
    var panel = el('div', { class: 'prince-panel', role: 'dialog', 'aria-label': '小王子助手' });

    var body = el('div', { class: 'body' });
    var quick = el('div', { class: 'quick' });
    var inputRow = el('div', { class: 'input-row' });
    var ta = el('textarea', { rows: '1', placeholder: '和小王子说点什么…' });
    var sendBtn = el('button', { class: 'send', text: '发送' });
    var uploadBtn = el('label', { text: '📷 上传图片' });
    var fileInput = el('input', { type: 'file', accept: 'image/*', multiple: 'multiple' });
    uploadBtn.appendChild(fileInput);
    var preview = el('div', { class: 'upload-preview' });
    var hint = el('span', {
      text: (CFG.aiEndpoint ? 'AI 已连接' : '本地模式') +
            ' · ' + (CFG.uploadEndpoint ? '图片直传后端' : '图片暂存本地')
    });

    sendBtn.addEventListener('click', function () { onSend(); });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
    });
    fileInput.addEventListener('change', async function () {
      var files = Array.from(fileInput.files || []);
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        addMsg('user', '📷 上传图片:' + f.name);
        var placeholder = addMsg('thinking', '小王子正在上传…');
        try {
          var res = await uploadOne(f);
          placeholder.remove();
          var note = res.local
            ? '已暂存到本地(配置后端后可直传):' + f.name
            : '已上传到后端:' + res.url;
          addMsg('bot', note);
          pushHistory('bot', note);
        } catch (err) {
          placeholder.remove();
          addMsg('bot', '上传失败:' + err.message);
        }
      }
      fileInput.value = '';
      refreshPreview();
    });

    function onSend() {
      var text = (ta.value || '').trim();
      if (!text) return;
      ta.value = '';
      addMsg('user', text);
      pushHistory('user', text);
      handleUser(text);
    }

    function refreshPreview() {
      preview.innerHTML = '';
      (state.uploads || []).slice(-6).forEach(function (u) {
        var chip = el('div', { class: 'chip' });
        var img = el('img', { src: u.data, alt: u.name });
        chip.appendChild(img);
        var x = el('span', { class: 'x', text: '×', title: '移除' });
        x.addEventListener('click', function () {
          state.uploads = state.uploads.filter(function (x2) { return x2.id !== u.id; });
          saveState(state);
          refreshPreview();
        });
        chip.appendChild(x);
        preview.appendChild(chip);
      });
    }

    async function handleUser(text) {
      // 快捷指令
      if (/总结当前页面|总结这个|总结当前/.test(text)) {
        var summary = summarizeCurrentPage();
        addMsg('bot', summary);
        pushHistory('bot', summary);
        return;
      }
      // 起草菜谱
      if (/^(添加|录入|新建|起草):/.test(text)) {
        var draft = draftRecipe(text.replace(/^(添加|录入|新建|起草):\s*/, ''));
        addMsg('bot', draft);
        pushHistory('bot', draft);
        return;
      }

      var placeholder = addMsg('thinking', '小王子在想…');
      try {
        var reply = await callAI([
          { role: 'system', content: '你是小王子,温暖简洁的菜谱助手。回答 ≤ 200 字。' },
          { role: 'user', content: text }
        ]);
        placeholder.remove();
        addMsg('bot', reply);
        pushHistory('bot', reply);
      } catch (e) {
        placeholder.remove();
        var local = localReply(text);
        addMsg('bot', local + (CFG.aiEndpoint ? '' : '\n\n(当前为本地模式,未配置 AI 后端)'));
        pushHistory('bot', local);
      }
    }

    function draftRecipe(raw) {
      var lines = raw.split(/[\n;,。]/).map(function (s) { return s.trim(); }).filter(Boolean);
      return [
        '📝 菜谱草稿(请复制到 _data/<拼音>.json):',
        '{',
        '  "name": "<菜名>",',
        '  "nameEn": "<英文名>",',
        '  "category": "chaocai",',
        '  "difficulty": "<难度>",',
        '  "time": "<用时>",',
        '  "servings": "<份量>",',
        '  "tags": ["…"],',
        '  "summary": "<一句话简介>",',
        '  "ingredients": [',
        '    { "name": "食材1", "amount": "用量" }',
        '  ],',
        '  "steps": [',
        '    { "title": "步骤1", "desc": "说明", "tip": "小贴士" }',
        '  ],',
        '  "tips": ["额外小贴士"]',
        '}',
        '',
        '原始输入:' + (lines.join(' | ') || '(空)')
      ].join('\n');
    }

    function addMsg(role, text) {
      var msg = el('div', { class: 'prince-msg ' + (role === 'user' ? 'user' : (role === 'thinking' ? 'thinking' : 'bot')), text: text });
      body.appendChild(msg);
      body.scrollTop = body.scrollHeight;
      return msg;
    }

    // 头部
    var head = el('div', { class: 'head' }, [
      el('div', { class: 'avatar', text: '👑' }),
      el('div', {}, [
        el('div', { class: 'title', text: '小王子 · 菜谱助手' }),
        el('div', { class: 'sub', text: '帮你录入、总结、配图' })
      ]),
      el('button', { class: 'close', text: '×', 'aria-label': '关闭', onclick: function () { panel.classList.remove('open'); } })
    ]);

    // 快捷按钮
    var quickBtns = [
      { label: '📋 总结当前页面', send: '总结当前页面' },
      { label: '➕ 起草新菜谱', send: '添加:示例菜名 食材 步骤' },
      { label: '🍺 啤酒选哪款?', send: '啤酒选哪款?' },
      { label: '❓ 我能做什么?', send: '你能做什么?' }
    ];
    quickBtns.forEach(function (q) {
      var b = el('button', { text: q.label });
      b.addEventListener('click', function () {
        ta.value = q.send;
        onSend();
      });
      quick.appendChild(b);
    });

    // 组装
    inputRow.appendChild(ta);
    inputRow.appendChild(sendBtn);
    var foot = el('div', { class: 'foot' }, [
      el('div', { class: 'toolbar' }, [uploadBtn, hint]),
      preview,
      inputRow
    ]);

    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(quick);
    panel.appendChild(foot);

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    // 回放历史
    if (state.history.length) {
      state.history.slice(-8).forEach(function (h) {
        addMsg(h.role === 'user' ? 'user' : 'bot', h.text);
      });
    } else {
      addMsg('bot', '你好呀 👋 我是小王子,这里是你的菜谱小助手。\n试着问我"青椒炒排骨怎么做"或者点下面的快捷按钮~');
    }
    refreshPreview();
  }

  // ---------- 启动 ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
