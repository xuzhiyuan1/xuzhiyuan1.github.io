const API = "https://finance.xuzhiyuan1.top/stocks";

const $ = (id) => document.getElementById(id);
const els = {
  loading: $("loading"), content: $("content"), error: $("error"),
  errorMessage: $("error-message"), liveDot: $("live-dot"),
  connection: $("connection-label"), asOf: $("as-of"),
  phase: $("market-phase"), confidence: $("confidence"),
  title: $("today-title"), headline: $("headline"), stanceNote: $("stance-note"),
  marketDate: $("market-date"), indices: $("indices"), breadth: $("breadth"),
  sectors: $("sectors"), watchlist: $("watchlist"), avoid: $("avoid-list"),
  playbook: $("playbook"), method: $("method-note"), sources: $("sources"),
  disclaimer: $("disclaimer")
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

function number(value, digits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("zh-CN", { maximumFractionDigits: digits }) : "--";
}

function pct(value, signed = true) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "--";
  const sign = signed && parsed > 0 ? "+" : "";
  return `${sign}${parsed.toFixed(2)}%`;
}

function changeClass(value) {
  const parsed = Number(value);
  return parsed > 0 ? "up" : parsed < 0 ? "down" : "flat";
}

function money(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "--";
  const absolute = Math.abs(parsed);
  if (absolute >= 1e12) return `${(parsed / 1e12).toFixed(2)}万亿`;
  if (absolute >= 1e8) return `${(parsed / 1e8).toFixed(1)}亿`;
  if (absolute >= 1e4) return `${(parsed / 1e4).toFixed(1)}万`;
  return number(parsed, 0);
}

function dateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "--";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(date).replace("/", "-");
}

function list(items) {
  return `<ul>${(items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderIndices(items) {
  els.indices.innerHTML = (items || []).map((item) => `
    <article class="index-card">
      <div class="index-name">${escapeHtml(item.name)}</div>
      <div class="index-value">${number(item.price)}</div>
      <div class="index-change ${changeClass(item.changePct)}">${pct(item.changePct)}</div>
    </article>
  `).join("");
}

function renderBreadth(value = {}) {
  const rise = Number(value.advancers) || 0;
  const fall = Number(value.decliners) || 0;
  const total = Math.max(rise + fall + (Number(value.flat) || 0), 1);
  const riseWidth = Math.max(2, rise / total * 100);
  const fallWidth = Math.max(2, fall / total * 100);
  els.breadth.innerHTML = `
    <div class="breadth-top">
      <strong>市场温度 ${escapeHtml(value.temperature || "--")}</strong>
      <span>样本 ${number(value.universe, 0)} 家</span>
    </div>
    <div class="breadth-bar" aria-label="上涨与下跌家数比例">
      <span class="rise" style="width:${riseWidth}%"></span>
      <span class="fall" style="width:${fallWidth}%"></span>
    </div>
    <div class="breadth-numbers">
      <div><small>上涨</small><b class="up">${number(rise, 0)}</b></div>
      <div><small>下跌</small><b class="down">${number(fall, 0)}</b></div>
      <div><small>跌超 5%</small><b>${number(value.down5Pct, 0)}</b></div>
    </div>
  `;
}

function renderSectors(items) {
  els.sectors.innerHTML = (items || []).map((item) => `
    <article class="sector-card">
      <div class="sector-head">
        <h3>${escapeHtml(item.name)}</h3>
        <span class="signal">${escapeHtml(item.signal)}</span>
      </div>
      <p class="sector-summary">${escapeHtml(item.summary)}</p>
      <div class="fact-row">
        ${(item.facts || []).map((fact) => `<span class="fact-chip">${escapeHtml(fact)}</span>`).join("")}
      </div>
    </article>
  `).join("");
}

function metric(label, value, className = "") {
  return `<div class="metric"><small>${escapeHtml(label)}</small><b class="${className}">${escapeHtml(value)}</b></div>`;
}

function renderStocks(items) {
  els.watchlist.innerHTML = (items || []).map((item) => {
    const quoteClass = changeClass(item.changePct);
    return `
      <details class="stock-card">
        <summary>
          <div class="stock-top">
            <div class="score-ring" style="--score:${Math.max(0, Math.min(100, Number(item.score) || 0)) * 3.6}deg"><span>${number(item.score, 0)}</span></div>
            <div class="stock-name">
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(item.code)} · ${escapeHtml(item.sector)}</p>
            </div>
            <div class="stock-quote">
              <b>${number(item.price)}</b>
              <span class="${quoteClass}">${pct(item.changePct)}</span>
            </div>
          </div>
          <div class="stock-status">
            <span class="grade">${escapeHtml(item.grade)}</span>
            <span class="status-text">${escapeHtml(item.status)}</span>
            <span class="expand-hint">＋</span>
          </div>
        </summary>
        <div class="stock-body">
          <div class="metric-grid">
            ${metric("PE-TTM", number(item.peTtm))}
            ${metric("PB", number(item.pb))}
            ${metric("主力净流", money(item.mainNetInflow), changeClass(item.mainNetInflow))}
            ${metric("营收同比", pct(item.revenueGrowthPct), changeClass(item.revenueGrowthPct))}
            ${metric("归母净利同比", pct(item.netProfitGrowthPct), changeClass(item.netProfitGrowthPct))}
            ${metric("年内涨跌", pct(item.changeYtdPct), changeClass(item.changeYtdPct))}
          </div>
          <div class="reason-block"><h4>WHY IT MATTERS</h4>${list(item.thesis)}</div>
          <div class="reason-block"><h4>WAIT FOR</h4>${list(item.watchFor)}</div>
          <div class="reason-block risk"><h4>RISK / INVALIDATION</h4>${list(item.risks)}</div>
        </div>
      </details>
    `;
  }).join("");
}

function renderAnalysis(data) {
  const stance = data.stance || {};
  els.phase.textContent = data.marketPhase || "--";
  els.confidence.textContent = `置信度 ${stance.confidence || "--"}`;
  els.title.textContent = stance.label || "--";
  els.headline.textContent = data.headline || "--";
  els.stanceNote.textContent = stance.note || "";
  els.marketDate.textContent = data.marketDate || "--";
  els.asOf.textContent = dateTime(data.asOf);
  renderIndices((data.market || {}).indices);
  renderBreadth((data.market || {}).breadth);
  renderSectors(data.sectors);
  renderStocks(data.watchlist);
  els.avoid.innerHTML = (data.avoid || []).map((item) => `
    <article class="risk-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.reason)}</p></article>
  `).join("");
  els.playbook.innerHTML = (data.playbook || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  els.method.textContent = data.methodNote || "";
  els.sources.innerHTML = (data.sources || []).map((item) => `
    <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      <span>${escapeHtml(item.name)}</span><span>${escapeHtml(item.scope || "来源")}</span>
    </a>
  `).join("");
  els.disclaimer.textContent = data.disclaimer || "";
}

async function load() {
  els.loading.hidden = false;
  els.content.hidden = true;
  els.error.hidden = true;
  els.liveDot.className = "live-dot";
  els.connection.textContent = "正在读取学校服务器…";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API}/latest?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`服务器返回 ${response.status}`);
    const data = await response.json();
    renderAnalysis(data);
    els.liveDot.className = "live-dot online";
    els.connection.textContent = "后端实时数据已连接";
    els.loading.hidden = true;
    els.content.hidden = false;
  } catch (error) {
    els.liveDot.className = "live-dot error";
    els.connection.textContent = "后端未连接";
    els.errorMessage.textContent = error.name === "AbortError" ? "连接超时，请检查学校服务器。" : `读取失败：${error.message}`;
    els.loading.hidden = true;
    els.error.hidden = false;
  } finally {
    clearTimeout(timer);
  }
}

$("refresh").addEventListener("click", load);
$("retry").addEventListener("click", load);
load();
