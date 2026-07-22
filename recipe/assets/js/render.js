/* ============================================================
   Recipe · 分类页共享渲染器
   用法:在分类页 index.html 里 <body> 之前写
     <script>window.__RECIPE_CAT__ = 'chaocai';</script>
     <script src="../assets/js/render.js"></script>
   行为:
     1. 拉后端 API https://recipe.xuzhiyuan1.top/data 拿到全部 recipes
     2. 按 window.__RECIPE_CAT__ 过滤当前分类
     3. 渲染成可展开的卡片(点开看完整菜谱,不再跳子页)
        - 卡片顶部:heroUrl 有值显示大图,否则用 emoji 封面
        - 详情末尾:notes 图文备注区
     4. 把当前展开的菜谱挂到 window.__CURRENT_RECIPE__,助手可总结
   ============================================================ */
(function () {
  'use strict';

  var CAT = (window.__RECIPE_CAT__ || '').trim();
  if (!CAT) {
    console.warn('[recipe] 未设置 window.__RECIPE_CAT__,跳过渲染。');
    return;
  }

  // 数据源:后端 API(取代原来的 ../_data/*.json 静态文件)
  var API = 'https://recipe.xuzhiyuan1.top/data';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function showError(grid, msg) {
    grid.innerHTML = ''
      + '<div class="empty">'
      +   '<div class="emoji">😢</div>'
      +   '<p>菜谱加载失败:' + msg + '</p>'
      +   '<p style="margin-top:10px;font-size:12px;">该页面数据来自后端 API,需要后端在线才能显示菜谱,请确认 recipe.xuzhiyuan1.top 可访问后重试。</p>'
      + '</div>';
  }

  function showEmpty(grid) {
    grid.innerHTML = ''
      + '<div class="empty">'
      +   '<div class="emoji">🥢</div>'
      +   '<p>这个分类下还没有菜品。</p>'
      +   '<p style="margin-top:12px;">点右下角 👑 小王子,跟它说:<br /><strong>"添加:菜名 食材 步骤"</strong> 就能起一个菜谱草稿。</p>'
      + '</div>';
  }

  function badge(label, value) {
    return '<span class="badge-item">' + label + ' <strong>' + value + '</strong></span>';
  }

  // 卡片封面:heroUrl 有值用大图(圆角/满宽/cover/懒加载),否则沿用 emoji
  function cover(r) {
    if (r.heroUrl) {
      return '<div class="cover has-img" style="padding:0;">'
        +   '<img src="' + r.heroUrl + '" alt="' + (r.name || '') + '" loading="lazy" '
        +     'style="width:100%;height:100%;max-width:100%;object-fit:cover;display:block;border-radius:inherit;" />'
        + '</div>';
    }
    return '<div class="cover">' + (r.emoji || '🍳') + '</div>';
  }

  function renderCard(r) {
    var meta = []
      .concat(r.time ? badge('用时', r.time) : '')
      .concat(r.difficulty ? badge('难度', r.difficulty) : '')
      .concat(r.servings ? badge('份量', r.servings) : '')
      .join('');

    return ''
      + '<article class="recipe-card" data-slug="' + r.slug + '">'
      +   '<button class="card-toggle" type="button" aria-expanded="false">'
      +     cover(r)
      +     '<div class="body">'
      +       '<h3>' + r.name + '</h3>'
      +       '<div class="meta">' + meta + '</div>'
      +       '<p class="summary">' + (r.summary || '') + '</p>'
      +       '<span class="open-hint">展开菜谱 ▾</span>'
      +     '</div>'
      +   '</button>'
      +   '<div class="detail" hidden></div>'
      + '</article>';
  }

  // 备注图文区:每条一段文字(保留换行),imgUrl 非空则配一张满宽圆角图
  function renderNotes(r) {
    var notes = (r.notes || []).filter(function (n) { return n && (n.text || n.imgUrl); });
    if (!notes.length) return '';
    var items = notes.map(function (n) {
      var img = n.imgUrl
        ? '<img src="' + n.imgUrl + '" alt="备注图" loading="lazy" '
          + 'style="display:block;width:100%;max-width:100%;object-fit:cover;border-radius:14px;margin:10px 0 0;" />'
        : '';
      var text = n.text
        ? '<p style="margin:0;white-space:pre-wrap;line-height:1.7;color:var(--ink-soft);">' + n.text + '</p>'
        : '';
      return '<div class="note-item" style="margin-bottom:16px;">' + text + img + '</div>';
    }).join('');
    return ''
      + '<section class="recipe-notes panel" style="margin-top:16px;">'
      +   '<h2>备注</h2>'
      +   items
      + '</section>';
  }

  function renderDetail(r) {
    var ing = (r.ingredients || []).map(function (it) {
      return '<li>'
           +   '<span class="ing-name">' + it.name + '</span>'
           +   '<span class="ing-amount' + (it.highlight ? ' hi' : '') + '">' + (it.amount || '') + '</span>'
           + '</li>';
    }).join('');

    var steps = (r.steps || []).map(function (s, i) {
      return '<li class="step-item">'
           +   '<div class="num">' + (i + 1) + '</div>'
           +   '<h3>' + (s.title || ('步骤 ' + (i + 1))) + '</h3>'
           +   '<p>' + (s.desc || '') + '</p>'
           +   (s.tip ? '<div class="tip">' + s.tip + '</div>' : '')
           + '</li>';
    }).join('');

    var tips = (r.tips && r.tips.length)
      ? '<div class="tips-block"><h3>⭐ 烹饪小贴士</h3><ul>'
        + r.tips.map(function (t) { return '<li>' + t + '</li>'; }).join('')
        + '</ul></div>'
      : '';

    var tags = (r.tags && r.tags.length)
      ? '<span class="badge-item">标签 <strong>' + r.tags.join(' · ') + '</strong></span>'
      : '';

    return ''
      + '<div class="detail-inner">'
      +   '<section class="recipe-hero">'
      +     '<h2>' + r.name + '</h2>'
      +     (r.nameEn ? '<div class="sub-en">' + r.nameEn + '</div>' : '')
      +     '<p style="margin:8px 0 0; color: var(--ink-soft);">' + (r.summary || '') + '</p>'
      +     '<div class="badges">'
      +       (r.difficulty ? badge('难度', r.difficulty) : '')
      +       (r.time ? badge('用时', r.time) : '')
      +       (r.servings ? badge('份量', r.servings) : '')
      +       tags
      +     '</div>'
      +   '</section>'
      +   '<section class="recipe-body">'
      +     '<aside class="panel"><h2>食材</h2><ul class="ing-list">' + ing + '</ul></aside>'
      +     '<article class="panel"><h2>步骤</h2><ol class="steps">' + steps + '</ol>' + tips + '</article>'
      +   '</section>'
      +   renderNotes(r)
      +   '<div class="detail-foot">'
      +     '<button class="close-detail" type="button">收起 ▴</button>'
      +   '</div>'
      + '</div>';
  }

  function attachToggle(card, recipe) {
    var btn = card.querySelector('.card-toggle');
    var detail = card.querySelector('.detail');
    var hint = card.querySelector('.open-hint');

    function setOpen(open) {
      if (open) {
        // 单选:其他打开的关掉
        document.querySelectorAll('.recipe-card.is-open').forEach(function (other) {
          if (other !== card) {
            other.classList.remove('is-open');
            var t = other.querySelector('.card-toggle');
            var d = other.querySelector('.detail');
            var h = other.querySelector('.open-hint');
            if (t) t.setAttribute('aria-expanded', 'false');
            if (d) { d.hidden = true; d.innerHTML = ''; }
            if (h) h.textContent = '展开菜谱 ▾';
          }
        });
        card.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
        if (detail.hidden) {
          detail.innerHTML = renderDetail(recipe);
          detail.hidden = false;
          var closer = card.querySelector('.close-detail');
          if (closer) closer.addEventListener('click', function () { setOpen(false); });
          // 滚到详情
          requestAnimationFrame(function () {
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        }
        hint.textContent = '已展开';
        window.__CURRENT_RECIPE__ = recipe;
      } else {
        card.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
        detail.hidden = true;
        detail.innerHTML = '';
        hint.textContent = '展开菜谱 ▾';
        // 清掉全局指针,避免助手拿错菜
        if (window.__CURRENT_RECIPE__ === recipe) window.__CURRENT_RECIPE__ = null;
      }
    }

    btn.addEventListener('click', function () {
      setOpen(!card.classList.contains('is-open'));
    });
  }

  async function load() {
    var grid = document.getElementById('grid');
    if (!grid) {
      console.error('[recipe] 找不到 #grid 容器');
      return;
    }

    try {
      var resp = await fetch(API, { cache: 'no-cache' });
      if (!resp.ok) throw new Error('后端 ' + API + ' → HTTP ' + resp.status);
      var data = await resp.json();
      if (!data || data.ok === false) throw new Error('后端返回异常');

      var recipes = (data.recipes || []).filter(function (r) { return r && r.category === CAT; });
      if (!recipes.length) { showEmpty(grid); return; }

      grid.classList.add('recipe-grid');
      grid.innerHTML = recipes.map(renderCard).join('');
      recipes.forEach(function (r, i) {
        var card = grid.children[i];
        attachToggle(card, r);
      });
    } catch (e) {
      console.error('[recipe] 加载失败:', e);
      showError(grid, e.message || String(e));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
