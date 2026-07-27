/* ============================================================
 * B612 · 礼物星图 — 小王子主题生日礼物记录
 * 手机优先 + localStorage 礼物记录 + 独立生日后端（DeepSeek CC / 图片）
 * ============================================================ */

(function(){
  'use strict';

  // ---------- 数据 ----------
  const STORAGE_KEY = 'b612-gift-records-v1';
  const API_BASE = 'https://ship.xuzhiyuan1.top/birthday/gift';
  const MAX_PHOTOS = 6;

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
  // ---------- 状态 ----------
  let records = loadRecords();
  let pendingPhotos = [];

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
    photoInput: $('#gift-images'),
    photoPreview: $('#gift-image-preview'),
    serviceDot: $('#service-dot'),
    serviceStatus: $('#service-status'),
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
  function photosOf(record){
    return (Array.isArray(record.images) ? record.images : [])
      .map(item=>typeof item==='string' ? {url:item} : item)
      .filter(item=>item && /^https:\/\//.test(item.url||''));
  }
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
    const controller = 'AbortController' in window ? new AbortController() : null;
    const timer = controller ? setTimeout(()=>controller.abort(), 210000) : null;
    try{
      const response = await fetch(API_BASE + '/upload', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({image_b64:imageB64, name:file.name||''}),
        signal:controller ? controller.signal : undefined
      });
      const data = await response.json().catch(()=>({}));
      if(!response.ok || !data.ok) throw new Error(data.error || `上传失败 (${response.status})`);
      return {url:data.url, bytes:data.bytes||0};
    }finally{ if(timer) clearTimeout(timer); }
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

  /** 单条记录的 HTML(桌面端展开版,移动端 CSS 会自动塌缩) */
  function renderRecord(r){
    const photos=photosOf(r);
    return `
      <div class="record ${r.direction}" data-id="${r.id}">
        <div class="badge">${r.direction==='received'?'🎁':'💝'}</div>
        <div class="body">
          <div class="meta">
            <span class="yr">${esc(r.year||'')}</span>
            ${r.date?`<span>${esc(r.date)}</span>`:''}
            <span class="occ">${esc(OCC_LABEL[r.occasion]||r.occasion||'')}</span>
            ${r.price?`<span class="price">${esc(fmtMoney(r.price))}</span>`:''}
          </div>
          <div class="person">${r.direction==='received'?'来自':'送给'} ${esc(r.person)}</div>
          <div class="gift">${esc(r.gift)}</div>
          ${r.note?`<div class="note">"${esc(r.note)}"</div>`:''}
          ${photos.length?`<div class="record-photo"><img src="${esc(photos[0].url)}" alt="${esc(r.gift||'礼物照片')}" loading="lazy">${photos.length>1?`<span>+${photos.length-1}</span>`:''}</div>`:''}
        </div>
      </div>
    `;
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
    // 按年份分组,便于纵向滚动时有清晰结构(尤其移动端)
    const groups = new Map();
    data.forEach(r=>{
      const y = r.year || '其他';
      if(!groups.has(y)) groups.set(y, []);
      groups.get(y).push(r);
    });
    const years = Array.from(groups.keys()).sort((a,b)=>{
      // 把"其他"排到最后
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
    let keptPhotos = photosOf(r).slice(0,MAX_PHOTOS);
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
        <div class="field photo-field">
          <label>礼物照片</label>
          <div class="photo-preview modal-photos" id="modal-photo-list"></div>
          <label class="photo-picker" for="modal-images">＋ 添加照片</label>
          <input type="file" id="modal-images" accept="image/*" multiple hidden>
          <p class="hint">最多 6 张；新增照片保存时上传并压缩。</p>
        </div>
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

    const photoList=$('#modal-photo-list',els.modalBody);
    function renderModalPhotos(){
      photoList.innerHTML=keptPhotos.map((photo,index)=>
        `<div class="photo-thumb"><img src="${esc(photo.url)}" alt="礼物照片"><button type="button" data-remove-photo="${index}" aria-label="移除照片">×</button></div>`
      ).join('');
      $$('[data-remove-photo]',photoList).forEach(button=>button.addEventListener('click',()=>{
        keptPhotos.splice(Number(button.dataset.removePhoto),1); renderModalPhotos();
      }));
    }
    renderModalPhotos();

    $('#modal-form', els.modalBody).addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const idx = records.findIndex(x=>x.id===r.id);
      if(idx<0) return;
      const files=Array.from($('#modal-images',els.modalBody).files||[]);
      if(keptPhotos.length+files.length>MAX_PHOTOS){ toast('每条记录最多 6 张照片'); return; }
      const submit=e.target.querySelector('button[type="submit"]');
      submit.disabled=true;
      let uploaded=[];
      try{ uploaded=await uploadFiles(files); }
      catch(err){ submit.disabled=false; toast(err.message||'照片上传失败',3200); return; }
      records[idx] = Object.assign({}, records[idx], {
        year: Number(fd.get('year')),
        date: fd.get('date')||'',
        person: String(fd.get('person')||'').trim(),
        gift: String(fd.get('gift')||'').trim(),
        occasion: fd.get('occasion')||'birthday',
        price: fd.get('price')?Number(fd.get('price')):null,
        note: String(fd.get('note')||'').trim(),
        direction: fd.get('direction'),
        images: keptPhotos.concat(uploaded),
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
  els.form.addEventListener('submit', async e=>{
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
      images: [],
      createdAt: Date.now()
    };
    if(!rec.person || !rec.gift){ toast('请填写对方姓名和礼物'); return; }
    const submit=els.form.querySelector('button[type="submit"]');
    submit.disabled=true;
    try{ rec.images=await uploadFiles(pendingPhotos.map(item=>item.file)); }
    catch(err){ submit.disabled=false; toast(err.message||'照片上传失败',3200); return; }
    records.unshift(rec);
    saveRecords(records);
    pendingPhotos.forEach(item=>item.preview&&URL.revokeObjectURL(item.preview));
    pendingPhotos=[]; renderPendingPhotos();
    els.form.reset();
    submit.disabled=false;
    toast('已种下一颗星 🌟');
    renderList();
    // 自动跳到星图
    els.tabs[0].click();
  });
  els.form.addEventListener('reset',()=>{
    pendingPhotos.forEach(item=>item.preview&&URL.revokeObjectURL(item.preview));
    pendingPhotos=[]; renderPendingPhotos();
  });

  // ---------- 独立后端状态 ----------
  async function checkService(showToast=false){
    try{
      const response=await fetch(API_BASE+'/ping',{cache:'no-store'});
      const data=await response.json();
      if(!response.ok||!data.ok) throw new Error('offline');
      els.serviceDot.classList.add('online');
      els.serviceStatus.textContent='已连接 · 独立生日后端 · DeepSeek CC · 图片≤300KB';
      els.chatHint.textContent='小王子运行在学校服务器，使用与曼谷相同的 DeepSeek API 配置。';
      els.chatHint.style.color='#aab0d2';
      if(showToast) toast('连接正常 ✅');
      return true;
    }catch(_){
      els.serviceDot.classList.remove('online');
      els.serviceStatus.textContent='暂时连接不上服务器';
      els.chatHint.textContent='⚠️ 小王子暂时离线，礼物文字记录仍可正常使用。';
      els.chatHint.style.color='#e87a8a';
      if(showToast) toast('连接失败，请稍后再试');
      return false;
    }
  }
  $('#btn-test').addEventListener('click',()=>checkService(true));

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
  //                     DeepSeek 小王子助手
  // ============================================================
  async function callAssistant(text){
    const recent=records.slice(0,30).map(r=>({direction:r.direction,year:r.year,person:r.person,gift:r.gift}));
    const response=await fetch(API_BASE+'/chat',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,recent})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok) throw new Error(data.error||`请求失败 (${response.status})`);
    return data.result||{};
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
    checkService(false);
  }

  async function handleChat(text){
    if(!text.trim()) return;
    addChat('user', text);
    els.chatText.value = '';
    const placeholder = addChat('bot', '小王子在想…');
    placeholder.textContent = '小王子在想…';
    try{
      const data = await callAssistant(text);
      placeholder.classList.remove('success');
      if(data.direction === 'none' || !data.person){
        placeholder.textContent = (data.reply || '我没能听清，能再说一次吗？');
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
      placeholder.textContent = '小王子的星球暂时失联了 💫：' + (err.message||err);
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

  // 暴露给调试用
  window.__B612 = { records: ()=>records, apiBase:API_BASE };

})();
