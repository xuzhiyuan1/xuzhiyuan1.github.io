/* ============================================================
 * B612 · 礼物星图 — 小王子主题礼物记录
 * 数据全走后端 + prince 设备白名单 + hashtag 数据模型
 * ============================================================ */

(function(){
  'use strict';

  // ---------- 配置 ----------
  const API = 'https://ship.xuzhiyuan1.top/gift';
  const BIRTHDAY_API = 'https://ship.xuzhiyuan1.top/birthday/days';
  const DEVICE_KEY = 'ship_device';
  const MAX_PHOTOS = 6;
  const ME = '我';

  // ---------- 设备标识（本地只存这一个） ----------
  function getDevice(){
    let d = '';
    try{ d = localStorage.getItem(DEVICE_KEY) || ''; }catch(e){}
    if(!d){
      d = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10);
      try{ localStorage.setItem(DEVICE_KEY, d); }catch(e){}
    }
    return d;
  }
  const device = getDevice();

  // ---------- 状态（全部来自后端，不落地 localStorage） ----------
  let records = [];
  let events = [];
  let birthdays = [];       // [{name, md, note}]
  let pendingPhotos = [];    // 新增表单待上传
  // 表单人名池
  let formSenders = [];
  let formRecipients = [];
  let formEvent = '';

  // ---------- DOM ----------
  const $ = (s,root=document)=>root.querySelector(s);
  const $$ = (s,root=document)=>Array.from(root.querySelectorAll(s));

  const els = {
    gate: $('#gate'),
    gateForm: $('#gate-form'),
    gatePass: $('#gate-pass'),
    gateLabel: $('#gate-label'),
    gateBtn: $('#gate-btn'),
    gateMsg: $('#gate-msg'),
    app: $('#app'),
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
    sendersInput: $('#senders-input'),
    recipientsInput: $('#recipients-input'),
    eventChips: $('#event-chips'),
    photoInput: $('#gift-images'),
    photoPreview: $('#gift-image-preview'),
    serviceDot: $('#service-dot'),
    serviceStatus: $('#service-status'),
    deviceLine: $('#device-line'),
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
  function toast(msg, ms=1800){
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>{ els.toast.hidden = true; }, ms);
  }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtMoney(p){ if(p==null||p==='') return ''; return '¥' + Number(p).toFixed(2).replace(/\.00$/,''); }
  function names(arr){ return Array.isArray(arr) ? arr.filter(Boolean) : []; }
  function joinNames(arr){ return names(arr).map(esc).join('、'); }

  function photosOf(record){
    return (Array.isArray(record.images) ? record.images : [])
      .filter(u => typeof u==='string' && /^https:\/\//.test(u));
  }

  // ---------- 后端请求封装 ----------
  async function api(path, opts){
    const res = await fetch(API + path, opts);
    let data = {};
    try{ data = await res.json(); }catch(e){}
    return { status: res.status, ok: res.ok && data && data.ok, data };
  }
  function post(path, body){
    return api(path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  }

  // ============================================================
  //                     prince 密码门
  // ============================================================
  async function probeAuth(){
    // 不带 pass 探测该设备是否已授权
    const r = await post('/auth', { device });
    return r.status === 200 && r.data && r.data.ok;
  }

  async function startup(){
    let authed = false;
    try{ authed = await probeAuth(); }
    catch(e){ authed = false; }
    if(authed){
      await enterApp();
    }else{
      showGate();
    }
  }

  function showGate(){
    els.gate.hidden = false;
    els.app.hidden = true;
    setTimeout(()=>els.gatePass.focus(), 100);
  }

  els.gateForm.addEventListener('submit', async e=>{
    e.preventDefault();
    const pass = els.gatePass.value.trim();
    if(!pass){ els.gateMsg.textContent = '请先输入口令。'; return; }
    els.gateBtn.disabled = true;
    els.gateMsg.textContent = '正在轻轻叩门…';
    try{
      const r = await post('/auth', { device, pass, label: els.gateLabel.value.trim() });
      if(r.status === 200 && r.data && r.data.ok){
        els.gateMsg.textContent = '';
        await enterApp();
      }else{
        els.gateMsg.textContent = '口令不对，小王子还在等真正的朋友。';
      }
    }catch(err){
      els.gateMsg.textContent = '连不上星球，请检查网络后再试。';
    }finally{
      els.gateBtn.disabled = false;
    }
  });

  async function enterApp(){
    els.gate.hidden = true;
    els.app.hidden = false;
    els.deviceLine.textContent = '本设备标识：' + device;
    await Promise.all([ loadData(), loadBirthdays() ]);
    initForm();
    renderList();
    checkService(false);
    // 展示欢迎语
    if(!els.chatLog.childElementCount){
      addChat('bot', '你好呀，我是住在 B612 的小王子。说一句话，我帮你把心意记成星星。');
    }
  }

  // ============================================================
  //                     数据加载
  // ============================================================
  async function loadData(){
    try{
      const r = await api('/data?device=' + encodeURIComponent(device));
      if(r.status === 200 && r.data && r.data.ok){
        records = Array.isArray(r.data.records) ? r.data.records : [];
        events = Array.isArray(r.data.events) ? r.data.events : [];
      }
    }catch(e){ toast('数据同步失败，请稍后重试', 2600); }
  }
  async function loadBirthdays(){
    try{
      const res = await fetch(BIRTHDAY_API + '/data?device=' + encodeURIComponent(device));
      const data = await res.json().catch(()=>({}));
      if(res.status === 200 && data.ok && Array.isArray(data.birthdays)){
        birthdays = data.birthdays;
      }
    }catch(e){ /* 生日名册可选，失败不阻塞 */ }
  }
  function birthdayMd(name){
    const hit = birthdays.find(b => b && b.name === name && /^\d{2}-\d{2}$/.test(b.md||''));
    return hit ? hit.md : '';
  }

  // ============================================================
  //          hashtag 展示规则（一送一 vs 复杂合集）
  // ============================================================
  /**
   * 返回一条记录的人名展示文本：
   *  - 一送一(senders/recipients 各恰好 1 人)：收到→"来自 X"、送出→"送给 X"
   *    (X 为非"我"那一方；两边都不是我则显示 "A → B")
   *  - 否则(任一边多于 1 人)：显示完整 "{送出方合集} → {收礼方合集}"
   */
  function personLine(r){
    const s = names(r.senders), rc = names(r.recipients);
    if(s.length === 1 && rc.length === 1){
      const sender = s[0], recip = rc[0];
      if(sender !== ME && recip !== ME){
        return esc(sender) + ' → ' + esc(recip);
      }
      const other = (sender === ME) ? recip : sender; // 非"我"的一方
      return (r.direction === 'received' ? '来自 ' : '送给 ') + esc(other);
    }
    // 复杂合集
    return (joinNames(s) || '？') + ' <span class="arrow">→</span> ' + (joinNames(rc) || '？');
  }

  /** 一条记录的 hashtag 标签数组（用于列表卡片展示） */
  function hashtagsHTML(r){
    const tags = [];
    tags.push(`<span class="tag dir ${r.direction}">#${r.direction==='received'?'收到':'送出'}</span>`);
    if(r.event) tags.push(`<span class="tag evt">#${esc(r.event)}</span>`);
    return tags.join('');
  }

  // ---------- 人名搜索用文本 ----------
  function allNamesText(r){
    return names(r.senders).concat(names(r.recipients)).join(' ');
  }

  // ============================================================
  //                     Tabs
  // ============================================================
  els.tabs.forEach(t=>{
    t.addEventListener('click', ()=>{
      els.tabs.forEach(x=>x.classList.remove('active'));
      els.views.forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const v = $('#view-' + t.dataset.view);
      if(v) v.classList.add('active');
      window.scrollTo({top:0, behavior:'smooth'});
      if(t.dataset.view==='assistant') checkService(false);
    });
  });

  // ============================================================
  //                     渲染：列表 / 统计
  // ============================================================
  function applyFilters(){
    const dir = els.filterDir.value;
    const year = els.filterYear.value;
    const q = els.filterQ.value.trim().toLowerCase();
    return records
      .filter(r => dir==='all' || r.direction===dir)
      .filter(r => year==='all' || String(r.year)===year)
      .filter(r => !q || (allNamesText(r)+' '+(r.gift||'')+' '+(r.event||'')+' '+(r.note||'')).toLowerCase().includes(q))
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
    records.forEach(r=>{
      names(r.senders).concat(names(r.recipients)).forEach(n=>{ if(n && n!==ME) people.add(n); });
    });
    const years = new Set(records.map(r=>r.year).filter(Boolean));
    els.statReceived.textContent = recv;
    els.statSent.textContent = sent;
    els.statPeople.textContent = people.size;
    els.statYears.textContent = years.size;
  }

  function renderRecord(r){
    const photos = photosOf(r);
    return `
      <div class="record ${r.direction}" data-id="${esc(r.id)}">
        <div class="badge">${r.direction==='received'?'🎁':'💝'}</div>
        <div class="body">
          <div class="tags">${hashtagsHTML(r)}</div>
          <div class="person">${personLine(r)}</div>
          <div class="gift">${esc(r.gift)}</div>
          <div class="meta">
            ${r.date?`<span>${esc(r.date)}</span>`:''}
            ${r.price?`<span class="price">${esc(fmtMoney(r.price))}</span>`:''}
          </div>
          ${r.note?`<div class="note">"${esc(r.note)}"</div>`:''}
          ${photos.length?`<div class="record-photo"><img src="${esc(photos[0])}" alt="${esc(r.gift||'礼物照片')}" loading="lazy">${photos.length>1?`<span>+${photos.length-1}</span>`:''}</div>`:''}
        </div>
      </div>`;
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
    const groups = new Map();
    data.forEach(r=>{
      const y = r.year || '其他';
      if(!groups.has(y)) groups.set(y, []);
      groups.get(y).push(r);
    });
    const years = Array.from(groups.keys()).sort((a,b)=>{
      if(a==='其他') return 1;
      if(b==='其他') return -1;
      return Number(b) - Number(a);
    });
    els.list.innerHTML = years.map(y=>`
      <div class="year-group">
        <div class="year-header">
          <span class="year-label">${esc(y)}</span>
          <span class="year-count">${groups.get(y).length} 颗星</span>
        </div>
        <div class="group-list">${groups.get(y).map(renderRecord).join('')}</div>
      </div>`).join('');
    $$('.record', els.list).forEach(node=>{
      node.addEventListener('click', ()=>{
        const r = records.find(x=>x.id===node.dataset.id);
        if(r) openModal(r);
      });
    });
  }

  [els.filterDir, els.filterYear].forEach(el=>el.addEventListener('change', renderList));
  els.filterQ.addEventListener('input', renderList);

  // ============================================================
  //                 chip 式多人输入组件
  // ============================================================
  function renderChips(container, pool){
    container.innerHTML =
      pool.map((n,i)=>`<span class="chip${n===ME?' me':''}">${esc(n)}<button type="button" data-rm="${i}" aria-label="移除">×</button></span>`).join('') +
      `<input type="text" class="chip-add" placeholder="+ 加名字" />`;
    const input = $('.chip-add', container);
    $$('[data-rm]', container).forEach(btn=>btn.addEventListener('click', ()=>{
      pool.splice(Number(btn.dataset.rm), 1);
      renderChips(container, pool);
    }));
    function commit(){
      const raw = input.value.trim().replace(/[,，、]$/,'').trim();
      if(raw && pool.indexOf(raw) < 0) pool.push(raw);
      input.value = '';
      renderChips(container, pool);
      $('.chip-add', container).focus();
    }
    input.addEventListener('keydown', e=>{
      if(e.key === 'Enter' || e.key === ',' || e.key === '，' || e.key === '、'){
        e.preventDefault();
        if(input.value.trim()) commit();
      }else if(e.key === 'Backspace' && !input.value && pool.length){
        pool.pop(); renderChips(container, pool); $('.chip-add', container).focus();
      }
    });
    input.addEventListener('blur', ()=>{ if(input.value.trim()) commit(); });
  }

  function renderEventChips(container, selected, onPick){
    const opts = events.slice();
    container.innerHTML =
      opts.map(ev=>`<button type="button" class="ev-chip${ev===selected?' on':''}" data-ev="${esc(ev)}">#${esc(ev)}</button>`).join('') +
      `<button type="button" class="ev-chip add" data-add="1">＋ 新标签</button>`;
    $$('[data-ev]', container).forEach(b=>b.addEventListener('click', ()=>onPick(b.dataset.ev)));
    $('[data-add]', container).addEventListener('click', async ()=>{
      const name = (prompt('新事件标签（例如：乔迁 / 满月 / 升学）') || '').trim();
      if(!name) return;
      if(events.indexOf(name) < 0){
        const next = events.concat([name]);
        const r = await post('/events', { device, events: next });
        if(r.ok){ events = r.data.events || next; }
        else { events = next; toast('标签已本地添加'); }
      }
      onPick(name);
    });
  }

  // ---------- 表单初始化 ----------
  function ensureMe(side){
    // 按方向把"我"预置到对应边（不重复）
    if(side === 'received'){
      if(formRecipients.indexOf(ME) < 0) formRecipients.unshift(ME);
    }else{
      if(formSenders.indexOf(ME) < 0) formSenders.unshift(ME);
    }
  }
  function initForm(){
    formSenders = [];
    formRecipients = [];
    formEvent = events[0] || '生日';
    const dir = els.form.direction.value;
    ensureMe(dir);
    els.form.year.value = new Date().getFullYear();
    renderChips(els.sendersInput, formSenders);
    renderChips(els.recipientsInput, formRecipients);
    renderEventChips(els.eventChips, formEvent, pickEvent);
    renderPendingPhotos();
  }

  // 方向切换：把"我"挪到正确一边（仅移动自动预置的"我"）
  $$('input[name="direction"]', els.form).forEach(radio=>{
    radio.addEventListener('change', ()=>{
      const dir = radio.value;
      // 移除两边的"我"，再按方向补回
      formSenders = formSenders.filter(n=>n!==ME);
      formRecipients = formRecipients.filter(n=>n!==ME);
      ensureMe(dir);
      renderChips(els.sendersInput, formSenders);
      renderChips(els.recipientsInput, formRecipients);
      maybeAutofillDate();
    });
  });

  // 事件选择的重绘需要稳定的回调
  function pickEvent(ev){
    formEvent = ev;
    renderEventChips(els.eventChips, formEvent, pickEvent);
    maybeAutofillDate();
  }

  // 生日自动填日期
  function maybeAutofillDate(){
    if(formEvent !== '生日') return;
    if(els.form.date.value) return;          // 已有日期不覆盖
    if(formRecipients.length !== 1) return;  // 收礼方恰好一人
    const md = birthdayMd(formRecipients[0]);
    if(!md) return;
    const year = els.form.year.value || new Date().getFullYear();
    els.form.date.value = year + '-' + md;
  }

  // ============================================================
  //                 弹层（查看 / 编辑 / 删除）
  // ============================================================
  function openModal(r){
    let mSenders = names(r.senders).slice();
    let mRecipients = names(r.recipients).slice();
    let mEvent = r.event || '生日';
    let keptPhotos = photosOf(r).slice(0, MAX_PHOTOS);
    const isRecv = r.direction === 'received';

    els.modalBody.innerHTML = `
      <h3 class="modal-title">${isRecv?'🎁 收到的礼物':'💝 送出的礼物'}</h3>
      <form class="form" id="modal-form">
        <div class="seg">
          <label class="seg-opt"><input type="radio" name="direction" value="received" ${isRecv?'checked':''}><span>🎁 收到</span></label>
          <label class="seg-opt"><input type="radio" name="direction" value="sent" ${!isRecv?'checked':''}><span>💝 送出</span></label>
        </div>
        <div class="field"><label>送出方</label><div class="chips-input" id="m-senders"></div></div>
        <div class="field"><label>收礼方</label><div class="chips-input" id="m-recipients"></div></div>
        <div class="field"><label>事件标签</label><div class="event-chips" id="m-events"></div></div>
        <div class="row">
          <div class="field"><label>年份</label><input type="number" name="year" value="${esc(r.year||'')}" required></div>
          <div class="field"><label>日期</label><input type="date" name="date" value="${esc(r.date||'')}"></div>
        </div>
        <div class="field"><label>礼物</label><textarea name="gift" rows="2" required>${esc(r.gift||'')}</textarea></div>
        <div class="field"><label>花费</label><input type="number" name="price" min="0" step="0.01" value="${esc(r.price||'')}"></div>
        <div class="field"><label>备注</label><textarea name="note" rows="2">${esc(r.note||'')}</textarea></div>
        <div class="field photo-field">
          <label>礼物照片</label>
          <div class="photo-preview modal-photos" id="modal-photo-list"></div>
          <label class="photo-picker" for="modal-images">＋ 添加照片</label>
          <input type="file" id="modal-images" accept="image/*" multiple hidden>
          <p class="hint">最多 6 张；新增照片保存时上传并压缩。</p>
        </div>
        <div class="actions">
          <button type="submit" class="btn primary">💾 保存</button>
          <button type="button" class="btn danger" id="btn-delete">🗑️ 删除</button>
        </div>
      </form>`;
    els.modal.hidden = false;

    const sc = $('#m-senders', els.modalBody);
    const rcC = $('#m-recipients', els.modalBody);
    const evC = $('#m-events', els.modalBody);
    renderChips(sc, mSenders);
    renderChips(rcC, mRecipients);
    function drawEvents(){ renderEventChips(evC, mEvent, ev=>{ mEvent = ev; drawEvents(); }); }
    drawEvents();

    const photoList = $('#modal-photo-list', els.modalBody);
    function renderModalPhotos(){
      photoList.innerHTML = keptPhotos.map((url,index)=>
        `<div class="photo-thumb"><img src="${esc(url)}" alt="礼物照片"><button type="button" data-remove-photo="${index}" aria-label="移除照片">×</button></div>`
      ).join('');
      $$('[data-remove-photo]',photoList).forEach(button=>button.addEventListener('click',()=>{
        keptPhotos.splice(Number(button.dataset.removePhoto),1); renderModalPhotos();
      }));
    }
    renderModalPhotos();

    $('#modal-form', els.modalBody).addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      if(!mSenders.length && !mRecipients.length){ toast('请至少填写送出方或收礼方'); return; }
      const files = Array.from($('#modal-images',els.modalBody).files||[]);
      if(keptPhotos.length+files.length>MAX_PHOTOS){ toast('每条记录最多 6 张照片'); return; }
      const submit = e.target.querySelector('button[type="submit"]');
      submit.disabled = true;
      let uploaded = [];
      try{ uploaded = await uploadFiles(files); }
      catch(err){ submit.disabled=false; toast(err.message||'照片上传失败',3200); return; }
      const record = {
        id: r.id,
        direction: fd.get('direction'),
        senders: mSenders.slice(),
        recipients: mRecipients.slice(),
        year: Number(fd.get('year')) || new Date().getFullYear(),
        date: fd.get('date')||'',
        gift: String(fd.get('gift')||'').trim(),
        event: mEvent,
        price: fd.get('price')?Number(fd.get('price')):null,
        note: String(fd.get('note')||'').trim(),
        images: keptPhotos.concat(uploaded),
      };
      const resp = await post('/record', { device, record });
      if(!resp.ok){ submit.disabled=false; toast(resp.data.error||'保存失败',3000); return; }
      await loadData();
      closeModal();
      renderList();
      toast('已保存 ✨');
    });

    $('#btn-delete', els.modalBody).addEventListener('click', async ()=>{
      if(!confirm('确定删除这条记录吗？')) return;
      const resp = await post('/del', { device, id: r.id });
      if(!resp.ok){ toast(resp.data.error||'删除失败'); return; }
      await loadData();
      closeModal();
      renderList();
      toast('已删除');
    });
  }
  function closeModal(){ els.modal.hidden = true; }
  els.modalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', e=>{ if(e.target===els.modal) closeModal(); });

  // ============================================================
  //                 照片上传
  // ============================================================
  function fileDataUrl(file){
    return new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.onerror = ()=>reject(new Error('照片读取失败'));
      reader.readAsDataURL(file);
    });
  }
  async function uploadPhoto(file){
    if(!file || !String(file.type||'').startsWith('image/')) throw new Error('请选择图片文件');
    if(file.size > 16*1024*1024) throw new Error('单张原图不能超过 16MB');
    const imageB64 = await fileDataUrl(file);
    const r = await post('/upload', { device, image_b64: imageB64 });
    if(!r.ok) throw new Error((r.data && r.data.error) || '上传失败');
    return r.data.url;
  }
  async function uploadFiles(files){
    const uploaded = [];
    for(let i=0;i<files.length;i++){
      toast(`正在压缩第 ${i+1}/${files.length} 张照片…`, 220000);
      uploaded.push(await uploadPhoto(files[i]));
    }
    return uploaded;
  }
  function renderPendingPhotos(){
    els.photoPreview.innerHTML = pendingPhotos.map((item,index)=>
      `<div class="photo-thumb"><img src="${esc(item.preview)}" alt="待上传照片"><button type="button" data-remove-pending="${index}" aria-label="移除照片">×</button></div>`
    ).join('');
    $$('[data-remove-pending]',els.photoPreview).forEach(button=>button.addEventListener('click',()=>{
      const index=Number(button.dataset.removePending);
      const old=pendingPhotos[index]; if(old&&old.preview) URL.revokeObjectURL(old.preview);
      pendingPhotos.splice(index,1); renderPendingPhotos();
    }));
  }
  els.photoInput.addEventListener('change',()=>{
    const room=MAX_PHOTOS-pendingPhotos.length;
    Array.from(els.photoInput.files||[]).slice(0,room).forEach(file=>pendingPhotos.push({file,preview:URL.createObjectURL(file)}));
    els.photoInput.value=''; renderPendingPhotos();
    if(room<=0) toast('每条记录最多 6 张照片');
  });

  // 事件 chip 重绘用稳定回调（覆盖 initForm 里的 arguments.callee）
  function bindEventChips(){ renderEventChips(els.eventChips, formEvent, pickEvent); }

  // ============================================================
  //                 新增表单提交
  // ============================================================
  els.form.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(els.form);
    maybeAutofillDate();
    if(!formSenders.length && !formRecipients.length){ toast('请填写送出方或收礼方'); return; }
    const gift = String(fd.get('gift')||'').trim();
    if(!gift){ toast('请填写礼物 / 描述'); return; }
    const submit = els.form.querySelector('button[type="submit"]');
    submit.disabled = true;
    let images = [];
    try{ images = await uploadFiles(pendingPhotos.map(item=>item.file)); }
    catch(err){ submit.disabled=false; toast(err.message||'照片上传失败',3200); return; }
    const record = {
      direction: fd.get('direction'),
      senders: formSenders.slice(),
      recipients: formRecipients.slice(),
      year: Number(fd.get('year')) || new Date().getFullYear(),
      date: els.form.date.value || '',
      gift,
      event: formEvent || '生日',
      price: fd.get('price')?Number(fd.get('price')):null,
      note: String(fd.get('note')||'').trim(),
      images,
    };
    const resp = await post('/record', { device, record });
    submit.disabled = false;
    if(!resp.ok){ toast(resp.data.error||'保存失败',3000); return; }
    pendingPhotos.forEach(item=>item.preview&&URL.revokeObjectURL(item.preview));
    pendingPhotos = [];
    els.form.reset();
    await loadData();
    initForm();
    bindEventChips();
    renderList();
    toast('已种下一颗星 🌟');
    els.tabs[0].click();
  });
  els.form.addEventListener('reset',()=>{
    pendingPhotos.forEach(item=>item.preview&&URL.revokeObjectURL(item.preview));
    pendingPhotos=[];
    setTimeout(()=>{ initForm(); bindEventChips(); }, 0);
  });
  // 年份/日期变动时也尝试自动填
  els.form.year.addEventListener('input', maybeAutofillDate);

  // ============================================================
  //                 服务器状态
  // ============================================================
  async function checkService(showToast){
    try{
      const res = await fetch(API+'/ping',{cache:'no-store'});
      const data = await res.json();
      if(!res.ok||!data.ok) throw new Error('offline');
      els.serviceDot.classList.add('online');
      els.serviceStatus.textContent = '已连接 · 学校服务器 · 数据后端存储 · 图片≤300KB';
      els.chatHint.textContent = '小王子运行在学校服务器，帮你把心意归档成星星。';
      els.chatHint.style.color = '#aab0d2';
      if(showToast) toast('连接正常 ✅');
      return true;
    }catch(_){
      els.serviceDot.classList.remove('online');
      els.serviceStatus.textContent = '暂时连接不上服务器';
      els.chatHint.textContent = '⚠️ 小王子暂时离线，请稍后再试。';
      els.chatHint.style.color = '#e87a8a';
      if(showToast) toast('连接失败，请稍后再试');
      return false;
    }
  }
  $('#btn-test').addEventListener('click',()=>checkService(true));
  $('#btn-refresh').addEventListener('click', async ()=>{
    await Promise.all([ loadData(), loadBirthdays() ]);
    renderList(); bindEventChips();
    toast('已重新同步 🔄');
  });

  // ============================================================
  //                 小王子助手（聊天）
  // ============================================================
  async function callAssistant(text){
    const recent = records.slice(0,30).map(r=>({direction:r.direction,year:r.year,senders:r.senders,recipients:r.recipients,gift:r.gift,event:r.event}));
    const r = await post('/chat', { device, text, recent });
    if(!r.ok) throw new Error((r.data && r.data.error) || `请求失败 (${r.status})`);
    return r.data.result || {};
  }
  function addChat(role, text, extra=''){
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.innerHTML = `${esc(text)}${extra}`;
    els.chatLog.appendChild(div);
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
    return div;
  }
  async function handleChat(text){
    if(!text.trim()) return;
    addChat('user', text);
    els.chatText.value = '';
    els.chatText.style.height = 'auto';
    const placeholder = addChat('bot', '小王子在想…');
    try{
      const res = await callAssistant(text);
      const senders = names(res.senders), recipients = names(res.recipients);
      if(res.direction === 'none' || (!senders.length && !recipients.length)){
        placeholder.textContent = res.reply || '我没能听清，能再说一次吗？';
        return;
      }
      const gift = String(res.gift||'').trim();
      if(!gift){
        placeholder.textContent = res.reply || '刚才那段信息好像不太完整，能告诉我礼物是什么吗？';
        return;
      }
      const year = Number(res.year) || new Date().getFullYear();
      let date = res.date || '';
      // 生日自动补日期：event=生日 且 date 空 且 收礼方一人有生日
      if((res.event||'生日')==='生日' && !date && recipients.length===1){
        const md = birthdayMd(recipients[0]);
        if(md) date = year + '-' + md;
      }
      const record = {
        direction: res.direction==='sent' ? 'sent' : 'received',
        senders, recipients,
        year, date,
        gift,
        event: String(res.event||'生日').trim() || '生日',
        price: res.price!=null && res.price!=='' ? Number(res.price) : null,
        note: res.note ? String(res.note) : '',
        images: [],
      };
      const resp = await post('/record', { device, record });
      if(!resp.ok){ placeholder.textContent = '存到星球时出了点岔子：' + (resp.data.error||''); return; }
      await loadData();
      renderList();
      bindEventChips();
      const newId = resp.data.id;
      placeholder.classList.add('success');
      placeholder.innerHTML = `已记下 🌟  ${esc(res.reply || '种下了一颗新的星星。')}<div class="actions"><button type="button" class="btn" data-jump="${esc(newId)}">查看这条</button></div>`;
      const btn = $('button[data-jump]', placeholder);
      if(btn) btn.addEventListener('click', ()=>{
        const r = records.find(x=>x.id===newId);
        if(r){ els.tabs[0].click(); setTimeout(()=>openModal(r), 60); }
      });
    }catch(err){
      placeholder.classList.remove('success');
      placeholder.textContent = '小王子的星球暂时失联了 💫：' + (err.message||err);
    }
  }
  els.chatForm.addEventListener('submit', e=>{ e.preventDefault(); handleChat(els.chatText.value); });
  els.chatText.addEventListener('input', ()=>{
    els.chatText.style.height = 'auto';
    els.chatText.style.height = Math.min(els.chatText.scrollHeight, 120) + 'px';
  });
  els.chatText.addEventListener('keydown', e=>{
    if(e.key==='Enter' && !e.shiftKey && window.innerWidth>520){
      e.preventDefault(); handleChat(els.chatText.value);
    }
  });

  // ============================================================
  //                 启动
  // ============================================================
  startup();
  window.__B612 = { records: ()=>records, events: ()=>events, birthdays: ()=>birthdays, api: API, device };

})();
