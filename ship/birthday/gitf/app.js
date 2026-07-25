/* ============================================================
 * B612 · 礼物星图 — 小王子主题生日礼物记录
 * 纯静态 + localStorage + DeepSeek API 助手
 * ============================================================ */

(function(){
  'use strict';

  // ---------- 数据 ----------
  const STORAGE_KEY = 'b612-gift-records-v1';
  const SETTINGS_KEY = 'b612-settings-v1';

  /** 加载所有礼物记录 */
  function loadRecords(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }catch(e){ console.warn('loadRecords',e); return []; }
  }
  function saveRecords(records){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }
  function loadSettings(){
    try{
      const raw = localStorage.getItem(SETTINGS_KEY);
      const def = {
        apiKey:'',
        model:'deepseek-chat',
        baseUrl:'https://api.deepseek.com/v1'
      };
      return Object.assign(def, raw ? JSON.parse(raw) : {});
    }catch(e){ return {apiKey:'',model:'deepseek-chat',baseUrl:'https://api.deepseek.com/v1'}; }
  }
  function saveSettings(s){
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  // ---------- 状态 ----------
  let records = loadRecords();
  let settings = loadSettings();

  // ---------- DOM ----------
  const $ = (s,root=document)=>root.querySelector(s);
  const $$ = (s,root=document)=>Array.from(root.querySelectorAll(s));

  const els = {
    list: $('#records-list'),
    empty: $('#empty-records'),
    filterDir: $('#filter-direction'),
    filterYear: $('#filter-year'),
    filterQ: $('#filter-q'),
    statReceived: $('#stat-received'),
    statSent: $('#stat-sent'),
    statPeople: $('#stat-people'),
    statYears: $('#stat-years'),
    form: $('#add-form'),
    settingsForm: $('#settings-form'),
    apiKey: $('#api-key'),
    apiModel: $('#api-model'),
    apiBase: $('#api-base'),
    chatLog: $('#chat-log'),
    chatForm: $('#chat-form'),
    chatText: $('#chat-text'),
    chatHint: $('#chat-hint'),
    modal: $('#modal'),
    modalBody: $('#modal-body'),
    modalClose: $('#modal-close'),
    toast: $('#toast'),
    tabs: $$('.tab'),
    views: $$('.view'),
  };

  // ---------- 工具 ----------
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
  function toast(msg, ms=1800){
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>{ els.toast.hidden = true; }, ms);
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtMoney(p){ if(p==null||p==='') return ''; return '¥' + Number(p).toFixed(2).replace(/\.00$/,''); }
  const OCC_LABEL = {birthday:'生日',christmas:'圣诞',newyear:'新年',anniversary:'纪念日',other:'其它'};

  // ---------- Tabs ----------
  els.tabs.forEach(t=>{
    t.addEventListener('click', ()=>{
      els.tabs.forEach(x=>x.classList.remove('active'));
      els.views.forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const v = $('#view-' + t.dataset.view);
      if(v) v.classList.add('active');
      window.scrollTo({top:0, behavior:'smooth'});
      if(t.dataset.view==='assistant') updateChatHint();
    });
  });

  // ---------- 渲染：列表 ----------
  function applyFilters(){
    const dir = els.filterDir.value;
    const year = els.filterYear.value;
    const q = els.filterQ.value.trim().toLowerCase();
    return records
      .filter(r => dir==='all' || r.direction===dir)
      .filter(r => year==='all' || String(r.year)===year)
      .filter(r => !q || (r.person+' '+r.gift+' '+(r.note||'')).toLowerCase().includes(q))
      .sort((a,b)=>{
        if((b.year||0)!==(a.year||0)) return (b.year||0)-(a.year||0);
        return (b.date||'').localeCompare(a.date||'');
      });
  }

  function renderYears(){
    const years = Array.from(new Set(records.map(r=>r.year).filter(Boolean))).sort((a,b)=>b-a);
    const cur = els.filterYear.value;
    els.filterYear.innerHTML = '<option value="all">全部</option>' +
      years.map(y=>`<option value="${y}" ${String(y)===cur?'selected':''}>${y}</option>`).join('');
  }

  function renderStats(){
    const recv = records.filter(r=>r.direction==='received').length;
    const sent = records.filter(r=>r.direction==='sent').length;
    const people = new Set();
    records.forEach(r=>people.add(r.person));
    const years = new Set(records.map(r=>r.year));
    els.statReceived.textContent = recv;
    els.statSent.textContent = sent;
    els.statPeople.textContent = people.size;
    els.statYears.textContent = years.size;
  }

  function renderList(){
    renderYears();
    renderStats();
    const data = applyFilters();
    if(!data.length){
      els.list.innerHTML = '';
      els.empty.hidden = false;
      return;
    }
    els.empty.hidden = true;
    els.list.innerHTML = data.map(r=>`
      <div class="record ${r.direction}" data-id="${r.id}">
        <div class="badge">${r.direction==='received'?'🎁':'💝'}</div>
        <div class="body">
          <div class="meta">
            <span class="year">${esc(r.year||'')}</span>
            ${r.date?`<span>${esc(r.date)}</span>`:''}
            <span class="occ">${esc(OCC_LABEL[r.occasion]||r.occasion||'')}</span>
            ${r.price?`<span class="price">${esc(fmtMoney(r.price))}</span>`:''}
          </div>
          <div class="person">${r.direction==='received'?'来自':'送给'}：${esc(r.person)}</div>
          <div class="gift">${esc(r.gift)}</div>
          ${r.note?`<div class="note">"${esc(r.note)}"</div>`:''}
        </div>
      </div>
    `).join('');
    $$('.record', els.list).forEach(node=>{
      node.addEventListener('click', ()=>{
        const r = records.find(x=>x.id===node.dataset.id);
        if(r) openModal(r);
      });
    });
  }

  [els.filterDir, els.filterYear].forEach(el=>el.addEventListener('change', renderList));
  els.filterQ.addEventListener('input', renderList);

  // ---------- 弹层（查看 / 编辑 / 删除） ----------
  function openModal(r){
    const isRecv = r.direction === 'received';
    els.modalBody.innerHTML = `
      <h3 style="margin:0 0 12px;color:var(--gold)">${isRecv?'🎁 收到的礼物':'💝 送出的礼物'}</h3>
      <form class="form" id="modal-form">
        <div class="row">
          <div class="field"><label>年份</label><input type="number" name="year" value="${esc(r.year||'')}" required></div>
          <div class="field"><label>日期</label><input type="date" name="date" value="${esc(r.date||'')}"></div>
        </div>
        <div class="field"><label>对方</label><input type="text" name="person" value="${esc(r.person||'')}" required></div>
        <div class="field"><label>礼物</label><textarea name="gift" rows="2" required>${esc(r.gift||'')}</textarea></div>
        <div class="row">
          <div class="field"><label>场合</label>
            <select name="occasion">
              ${['birthday','christmas','newyear','anniversary','other'].map(o=>`<option value="${o}" ${r.occasion===o?'selected':''}>${OCC_LABEL[o]}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>花费</label><input type="number" name="price" min="0" step="0.01" value="${esc(r.price||'')}"></div>
        </div>
        <div class="field"><label>备注</label><textarea name="note" rows="2">${esc(r.note||'')}</textarea></div>
        <div class="field"><label>类型</label>
          <div class="seg">
            <label class="seg-opt"><input type="radio" name="direction" value="received" ${isRecv?'checked':''}><span>🎁 收到</span></label>
            <label class="seg-opt"><input type="radio" name="direction" value="sent" ${!isRecv?'checked':''}><span>💝 送出</span></label>
          </div>
        </div>
        <div class="actions">
          <button type="submit" class="btn primary">💾 保存</button>
          <button type="button" class="btn danger" id="btn-delete">🗑️ 删除</button>
        </div>
      </form>
    `;
    els.modal.hidden = false;

    $('#modal-form', els.modalBody).addEventListener('submit', e=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const idx = records.findIndex(x=>x.id===r.id);
      if(idx<0) return;
      records[idx] = Object.assign({}, records[idx], {
        year: Number(fd.get('year')),
        date: fd.get('date')||'',
        person: String(fd.get('person')||'').trim(),
        gift: String(fd.get('gift')||'').trim(),
        occasion: fd.get('occasion')||'birthday',
        price: fd.get('price')?Number(fd.get('price')):null,
        note: String(fd.get('note')||'').trim(),
        direction: fd.get('direction'),
        updatedAt: Date.now()
      });
      saveRecords(records);
      closeModal();
      renderList();
      toast('已保存 ✨');
    });

    $('#btn-delete', els.modalBody).addEventListener('click', ()=>{
      if(!confirm('确定删除这条记录吗？')) return;
      records = records.filter(x=>x.id!==r.id);
      saveRecords(records);
      closeModal();
      renderList();
      toast('已删除');
    });
  }
  function closeModal(){ els.modal.hidden = true; }
  els.modalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', e=>{ if(e.target===els.modal) closeModal(); });

  // ---------- 新增表单 ----------
  els.form.addEventListener('submit', e=>{
    e.preventDefault();
    const fd = new FormData(els.form);
    const yearVal = fd.get('year');
    const year = yearVal ? Number(yearVal) : new Date().getFullYear();
    const rec = {
      id: uid(),
      direction: fd.get('direction'),
      year,
      date: fd.get('date')||'',
      person: String(fd.get('person')||'').trim(),
      gift: String(fd.get('gift')||'').trim(),
      occasion: fd.get('occasion')||'birthday',
      price: fd.get('price')?Number(fd.get('price')):null,
      note: String(fd.get('note')||'').trim(),
      createdAt: Date.now()
    };
    if(!rec.person || !rec.gift){ toast('请填写对方姓名和礼物'); return; }
    records.unshift(rec);
    saveRecords(records);
    els.form.reset();
    toast('已种下一颗星 🌟');
    renderList();
    // 自动跳到星图
    els.tabs[0].click();
  });

  // ---------- 设置 ----------
  function fillSettings(){
    els.apiKey.value = settings.apiKey || '';
    els.apiModel.value = settings.model || 'deepseek-chat';
    els.apiBase.value = settings.baseUrl || 'https://api.deepseek.com/v1';
  }
  els.settingsForm.addEventListener('submit', e=>{
    e.preventDefault();
    settings = {
      apiKey: els.apiKey.value.trim(),
      model: els.apiModel.value,
      baseUrl: els.apiBase.value.trim() || 'https://api.deepseek.com/v1'
    };
    saveSettings(settings);
    toast('设置已保存 💾');
    updateChatHint();
  });
  fillSettings();

  $('#btn-test').addEventListener('click', async ()=>{
    const tmp = {
      apiKey: els.apiKey.value.trim(),
      model: els.apiModel.value,
      baseUrl: els.apiBase.value.trim() || 'https://api.deepseek.com/v1'
    };
    if(!tmp.apiKey){ toast('请先填入 API Key'); return; }
    toast('正在测试连接…');
    try{
      const res = await callDeepSeek(tmp, [{role:'user',content:'只回复一个字：好'}]);
      toast('连接成功 ✅');
      addChat('bot', '连接成功 ✅ 模型回应：' + (res||'(空)'));
    }catch(err){
      toast('连接失败 ❌');
      addChat('bot', '连接失败：' + (err.message||err));
    }
  });

  // ---------- 数据导入/导出/清空 ----------
  $('#btn-export').addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify({records, exportedAt:new Date().toISOString(), version:1}, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0,10);
    a.href = url; a.download = `gift-starmap-${ts}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 100);
    toast('已导出 ⬇️');
  });
  $('#btn-import').addEventListener('click', ()=>$('#import-file').click());
  $('#import-file').addEventListener('change', e=>{
    const f = e.target.files[0];
    if(!f) return;
    const fr = new FileReader();
    fr.onload = ev=>{
      try{
        const data = JSON.parse(ev.target.result);
        if(!data.records || !Array.isArray(data.records)) throw new Error('文件格式不对');
        if(!confirm(`检测到 ${data.records.length} 条记录，是否合并导入？\n（同名 ID 会被覆盖）`)) return;
        const map = new Map(records.map(r=>[r.id,r]));
        data.records.forEach(r=>{ if(r && r.id && r.person && r.gift) map.set(r.id, r); });
        records = Array.from(map.values());
        saveRecords(records);
        renderList();
        toast(`已合并 ${data.records.length} 条 ⬆️`);
      }catch(err){
        toast('导入失败：' + err.message);
      }
    };
    fr.readAsText(f);
    e.target.value = '';
  });
  $('#btn-clear').addEventListener('click', ()=>{
    if(!confirm('确定清空所有记录？建议先导出备份。')) return;
    if(!confirm('真的清空？此操作不可恢复。')) return;
    records = [];
    saveRecords(records);
    renderList();
    toast('已清空 🗑️');
  });

  // ============================================================
  //                     DeepSeek 狐狸助手
  // ============================================================
  const SYSTEM_PROMPT = `你是"小王子"的狐狸助手，住在 B612 星球。任务是帮用户把生日礼物相关的事件（收到 / 送出）记录下来。

请按以下规则工作：
1. 仔细阅读用户的输入（中文为主），从中抽取：年份、日期（如未给出则为空）、对方姓名、礼物/描述、场合（birthday/christmas/newyear/anniversary/other 之一，默认 birthday）、金额（如未给出则为 null）、备注（简短情节或心情，可为空）、direction（received=收到 / sent=送出，从语境推断）。
2. 只能基于用户输入抽取，不要编造字段。如果某字段用户没提到，填合理默认：年份默认当前年，场合默认 birthday。
3. 如果用户说"刚"、"今年"等模糊词，年份使用当前年。
4. 输出一个 JSON 对象（不要任何其它文字、不要 markdown 代码块），字段：
   {"direction":"received|sent","year":2024,"date":"2024-03-15 或 空","person":"姓名","gift":"礼物描述","occasion":"birthday","price":null,"note":"备注 或 空","reply":"一句温柔的小王子风格回复"}
5. "reply" 字段是你对用户的话，不超过 30 字，中文。
6. 若用户输入与礼物记录完全无关（例如闲聊、问别的），reply 直接回答问题，direction 设为 "none"，其它字段填空字符串或 null。`;

  function buildContextPrompt(){
    // 携带最近 30 条做去重参考，让模型能识别"又是小明"
    const recent = records.slice(0,30).map(r=>({
      direction:r.direction, year:r.year, person:r.person, gift:r.gift
    }));
    return `当前日期：${new Date().toISOString().slice(0,10)}。\n以下是用户已记录的最近礼物（参考，不要直接重复）：${JSON.stringify(recent)}`;
  }

  async function callDeepSeek(opts, messages){
    const url = (opts.baseUrl||'https://api.deepseek.com/v1').replace(/\/+$/,'') + '/chat/completions';
    const body = {
      model: opts.model || 'deepseek-chat',
      messages,
      temperature: 0.4,
      max_tokens: 600,
      stream: false
    };
    const resp = await fetch(url, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization': 'Bearer ' + opts.apiKey
      },
      body: JSON.stringify(body)
    });
    if(!resp.ok){
      let msg = resp.status + ' ' + resp.statusText;
      try{ const j = await resp.json(); msg = (j.error&&j.error.message) || j.message || msg; }catch(_){}
      throw new Error(msg);
    }
    const data = await resp.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return String(content||'').trim();
  }

  function extractJSON(text){
    // 尝试从回复中抠 JSON
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if(fenced) text = fenced[1];
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if(start<0||end<0||end<=start) return null;
    try{ return JSON.parse(text.slice(start, end+1)); }catch(_){ return null; }
  }

  function addChat(role, text, extra=''){
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.innerHTML = `${esc(text)}${extra}`;
    els.chatLog.appendChild(div);
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
    return div;
  }

  function updateChatHint(){
    if(!settings.apiKey){
      els.chatHint.textContent = '⚠️ 先在「设置」里填入 DeepSeek API Key 才能使用助手。';
      els.chatHint.style.color = '#e87a8a';
    }else{
      els.chatHint.textContent = '已配置 API Key（' + settings.model + '）· 数据仅在本机浏览器';
      els.chatHint.style.color = '#aab0d2';
    }
  }

  async function handleChat(text){
    if(!text.trim()) return;
    if(!settings.apiKey){
      addChat('bot', '请先到「设置」页填入 DeepSeek API Key。我在这儿等你 🦊');
      return;
    }
    addChat('user', text);
    els.chatText.value = '';
    const placeholder = addChat('bot', '小狐狸在想…');
    placeholder.textContent = '小狐狸在想…';
    try{
      const msgs = [
        {role:'system', content: SYSTEM_PROMPT},
        {role:'system', content: buildContextPrompt()},
        {role:'user', content: text}
      ];
      const raw = await callDeepSeek(settings, msgs);
      const data = extractJSON(raw) || {};
      placeholder.classList.remove('success');
      if(data.direction === 'none' || !data.person){
        placeholder.textContent = (data.reply || raw || '我没能听清，能再说一次吗？');
        return;
      }
      // 构造记录
      const rec = {
        id: uid(),
        direction: data.direction === 'sent' ? 'sent' : 'received',
        year: Number(data.year) || new Date().getFullYear(),
        date: data.date || '',
        person: String(data.person||'').trim(),
        gift: String(data.gift||'').trim(),
        occasion: ['birthday','christmas','newyear','anniversary','other'].includes(data.occasion) ? data.occasion : 'birthday',
        price: data.price ? Number(data.price) : null,
        note: data.note ? String(data.note) : '',
        createdAt: Date.now()
      };
      // 二次校验：必须有人名和礼物
      if(!rec.person || !rec.gift){
        placeholder.textContent = (data.reply || '刚才那段信息好像不太完整，能告诉我礼物是什么吗？');
        return;
      }
      records.unshift(rec);
      saveRecords(records);
      renderList();
      placeholder.classList.add('success');
      placeholder.innerHTML = `已记下 🌟  ${esc(data.reply || '种下了一颗新的星星。')}<div class="actions"><button type="button" class="btn" data-jump="${rec.id}">查看这条</button></div>`;
      const btn = $('button[data-jump]', placeholder);
      if(btn){
        btn.addEventListener('click', ()=>{
          const r = records.find(x=>x.id===rec.id);
          if(r){
            els.tabs[0].click();
            setTimeout(()=>openModal(r), 50);
          }
        });
      }
    }catch(err){
      placeholder.classList.remove('success');
      placeholder.textContent = '呜呜，狐狸摔了一跤 🦊💫：' + (err.message||err);
    }
  }

  els.chatForm.addEventListener('submit', e=>{
    e.preventDefault();
    handleChat(els.chatText.value);
  });
  els.chatText.addEventListener('keydown', e=>{
    if(e.key==='Enter' && !e.shiftKey && window.innerWidth>520){
      e.preventDefault();
      handleChat(els.chatText.value);
    }
  });

  // ---------- 启动 ----------
  updateChatHint();
  renderList();
  fillSettings();

  // 暴露给调试用
  window.__B612 = { records: ()=>records, settings: ()=>settings };

})();