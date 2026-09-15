import { recomputeDelta, TIMEZONE } from "./shared/normalize.mjs";

const kstFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function fmtKst(iso) {
  if (!iso) return "—";
  try {
    return kstFormatter.format(new Date(iso)) + " KST";
  } catch {
    return iso;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadRecords() {
  const res = await fetch("data/records.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`records.json 로드 실패 (${res.status})`);
  return res.json();
}

function renderMainCard(store) {
  const el = document.getElementById("main-card");
  const queryTime = new Date().toISOString(); // 이 페이지를 보는 지금 이 순간 (조회 시각)
  const good = store.last_good;
  const status = store.last_status?.status ?? "error";
  const errorCode = store.last_status?.error_code ?? "none";

  if (!good) {
    el.innerHTML = `
      <span class="status-badge error">● 아직 실제 기록 없음</span>
      <p class="hint">첫 실제 수집이 아직 실행되지 않았습니다. (error_code: ${escapeHtml(errorCode)})</p>
      <dl class="meta-grid">
        <dt>조회 시각</dt><dd>${fmtKst(queryTime)}</dd>
        <dt>기준 시간대</dt><dd>${TIMEZONE}</dd>
      </dl>`;
    return;
  }

  const badgeClass = status === "fresh" ? "fresh" : status === "stale" ? "stale" : "error";
  const badgeLabel = status === "fresh" ? "정상 (fresh)" : status === "stale" ? `오래된 값 (stale · ${errorCode})` : `오류 (${errorCode})`;

  el.innerHTML = `
    <span class="status-badge ${badgeClass}">● ${badgeLabel}</span>
    <div class="moon-value">${good.value}${good.unit}</div>
    <div class="moon-phase">${escapeHtml(good.phase_name)}</div>
    <dl class="meta-grid">
      <dt>기록 날짜</dt><dd>${good.record_date}</dd>
      <dt>값 / 단위</dt><dd>${good.value} ${good.unit}</dd>
      <dt>출처</dt><dd><a href="${good.source_url}" target="_blank" rel="noopener">USNO Astronomical Applications API</a></dd>
      <dt>출처 시각</dt><dd>${fmtKst(good.source_observed_at)}</dd>
      <dt>조회 시각</dt><dd>${fmtKst(queryTime)}</dd>
      <dt>기준 시간대</dt><dd>${TIMEZONE} (${good.location?.label ?? ""} ${good.location?.lat ?? ""}, ${good.location?.lon ?? ""})</dd>
      <dt>월출 / 월몰</dt><dd>${good.moonrise ?? "—"} / ${good.moonset ?? "—"}</dd>
    </dl>
    <button class="raw-toggle" id="toggle-main-raw">원자료 보기 (원자료 · 저장값 · 화면값 대조)</button>
    <div class="raw-view" id="main-raw" hidden></div>
  `;

  document.getElementById("toggle-main-raw").addEventListener("click", () => {
    const raw = document.getElementById("main-raw");
    raw.hidden = !raw.hidden;
    if (!raw.hidden) {
      raw.textContent = JSON.stringify(
        {
          원자료_raw: good.raw,
          저장값_stored: { value: good.value, unit: good.unit, phase_name: good.phase_name },
          화면값_displayed: `${good.value}${good.unit} · ${good.phase_name}`,
        },
        null,
        2
      );
    }
  });
}

function renderDailyTable(store) {
  const el = document.getElementById("daily-table");
  if (!store.daily.length) {
    el.innerHTML = `<p class="hint">아직 저장된 일별 기록이 없습니다.</p>`;
    return;
  }
  const rows = store.daily
    .map((row, i) => {
      const prev = store.daily[i - 1];
      const delta = prev ? recomputeDelta(prev, row) : null;
      const deltaText = delta ? `${delta.delta > 0 ? "+" : ""}${delta.delta}${delta.unit}` : "—";
      const deltaClass = delta ? (delta.delta > 0 ? "delta-pos" : delta.delta < 0 ? "delta-neg" : "") : "";
      return `<tr>
        <td>${row.record_date}</td>
        <td>${row.value}${row.unit}</td>
        <td>${escapeHtml(row.phase_name)}</td>
        <td class="${deltaClass}">${deltaText}</td>
        <td><button class="raw-toggle" data-idx="${i}">원자료 보기</button></td>
      </tr>
      <tr class="raw-row" id="raw-row-${i}" hidden><td colspan="5"><div class="raw-view">${escapeHtml(
        JSON.stringify({ source_url: row.source_url, source_observed_at: row.source_observed_at, raw: row.raw }, null, 2)
      )}</div></td></tr>`;
    })
    .join("");

  el.innerHTML = `<table>
    <thead><tr><th>날짜(KST)</th><th>조명 비율</th><th>위상</th><th>전일 대비</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  el.querySelectorAll("button[data-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = document.getElementById(`raw-row-${btn.dataset.idx}`);
      row.hidden = !row.hidden;
    });
  });
}

async function main() {
  document.getElementById("source-link").href =
    document.querySelector('meta[name="repo-url"]')?.content || "#";
  try {
    const store = await loadRecords();
    renderMainCard(store);
    renderDailyTable(store);
  } catch (err) {
    document.getElementById("main-card").innerHTML = `<span class="status-badge error">● 로딩 실패</span><p class="hint">${escapeHtml(
      err.message
    )}</p>`;
  }
}

main();
