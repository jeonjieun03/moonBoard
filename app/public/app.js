import { recomputeDelta } from "./shared/store.mjs";
import { TIMEZONE } from "./shared/usno-adapter.mjs";
import { runSuccessSequence, runFailureSequence, runRecoverySequence, FAILURE_IDS } from "./shared/synthetic.mjs";
import { renderMoonSvg } from "./shared/moon-shape.mjs";

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

const ERROR_LABEL = {
  none: "정상",
  timeout: "느린 응답(timeout)",
  auth: "인증 거절(401/403)",
  rate_limit: "호출 제한(429)",
  offline: "오프라인",
  schema_error: "응답 형식 변경",
};

async function loadRealState() {
  const res = await fetch("data/records.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`records.json 로드 실패 (${res.status})`);
  return res.json();
}

function findDisplay(state, row) {
  return row?.display ?? null;
}

function renderMainCard(state) {
  const el = document.getElementById("main-card");
  const good = state.current_reading;
  const status = state.status;
  const goodRow = good ? state.daily_readings.find((r) => r.record_date === good.record_date) : null;
  const display = findDisplay(state, goodRow);

  if (!good || !status) {
    el.innerHTML = `
      <span class="status-badge error">● 아직 실제 기록 없음</span>
      <p class="hint">첫 실제 수집이 아직 실행되지 않았습니다.</p>
      <dl class="meta-grid"><dt>기준 시간대</dt><dd>${TIMEZONE}</dd></dl>`;
    return;
  }

  const badgeClass = status.freshness === "fresh" ? "fresh" : "stale";
  const badgeLabel = status.freshness === "fresh" ? "정상 (fresh)" : `오래된 값 (stale · ${ERROR_LABEL[status.error_code] ?? status.error_code})`;

  el.innerHTML = `
    <span class="status-badge ${badgeClass}">● ${badgeLabel}</span>
    <div class="moon-visual">${renderMoonSvg(good.normalized_value, display?.phase_name, { id: "main" })}</div>
    <div class="moon-value">${good.normalized_value}${good.unit}</div>
    <div class="moon-phase">${escapeHtml(display?.phase_name ?? "")}</div>
    <dl class="meta-grid">
      <dt>기록 날짜</dt><dd>${good.record_date}</dd>
      <dt>값 / 단위</dt><dd>${good.normalized_value} ${good.unit}</dd>
      <dt>출처</dt><dd><a href="${good.source_url}" target="_blank" rel="noopener">${escapeHtml(good.source_name)}</a></dd>
      <dt>출처 시각</dt><dd>${fmtKst(good.source_time)} <span class="hint">(USNO는 하루 단위로 계산 — 그 날짜 기준값)</span></dd>
      <dt>조회 시각</dt><dd>${fmtKst(good.fetched_at)} <span class="hint">(이 값을 실제로 호출한 시각)</span></dd>
      <dt>기준 시간대</dt><dd>${good.record_timezone} (${display?.location?.label ?? ""} ${display?.location?.lat ?? ""}, ${display?.location?.lon ?? ""})</dd>
      <dt>월출 / 월몰</dt><dd>${display?.moonrise ?? "—"} / ${display?.moonset ?? "—"}</dd>
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
          원자료_raw: display?.raw ?? null,
          저장값_stored_normalized_reading: good,
          화면값_displayed: `${good.normalized_value}${good.unit} · ${display?.phase_name ?? ""}`,
        },
        null,
        2
      );
    }
  });
}

function renderDailyTable(state) {
  const el = document.getElementById("daily-table");
  const rows = state.daily_readings;
  if (!rows.length) {
    el.innerHTML = `<p class="hint">아직 저장된 일별 기록이 없습니다.</p>`;
    return;
  }
  const html = rows
    .map((row, i) => {
      const prev = rows[i - 1];
      const delta = prev ? recomputeDelta(prev.reading, row.reading) : null;
      const deltaText = delta ? `${delta.delta > 0 ? "+" : ""}${delta.delta}${delta.unit}` : "—";
      const deltaClass = delta ? (delta.delta > 0 ? "delta-pos" : delta.delta < 0 ? "delta-neg" : "") : "";
      return `<tr>
        <td>${row.record_date}</td>
        <td class="mini-moon-cell">${renderMoonSvg(row.normalized_value, row.display?.phase_name, { size: 26, id: `row-${row.record_date}` })} ${row.normalized_value}${row.unit}</td>
        <td>${escapeHtml(row.display?.phase_name ?? "")}</td>
        <td class="${deltaClass}">${deltaText}</td>
        <td><button class="raw-toggle" data-idx="${i}">원자료 보기</button></td>
      </tr>
      <tr class="raw-row" id="raw-row-${i}" hidden><td colspan="5"><div class="raw-view">${escapeHtml(
        JSON.stringify({ 저장된_normalized_reading: row.reading, 화면_부가정보: row.display }, null, 2)
      )}</div></td></tr>`;
    })
    .join("");

  el.innerHTML = `<table>
    <thead><tr><th>날짜(KST)</th><th>조명 비율</th><th>위상</th><th>전일 대비</th><th></th></tr></thead>
    <tbody>${html}</tbody>
  </table>`;

  el.querySelectorAll("button[data-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = document.getElementById(`raw-row-${btn.dataset.idx}`);
      row.hidden = !row.hidden;
    });
  });
}

function renderSyntheticResult(label, state) {
  const box = document.getElementById("synthetic-result");
  box.hidden = false;
  const status = state.status;
  const badgeClass = status?.freshness === "fresh" ? "fresh" : status ? "stale" : "error";
  const badgeLabel = !status ? "—" : status.freshness === "fresh" ? "fresh / none" : `stale / ${status.error_code}`;
  box.innerHTML = `
    <p class="hint">재생: <strong>${escapeHtml(label)}</strong></p>
    <span class="status-badge ${badgeClass}">● ${badgeLabel}</span>
    <dl class="meta-grid">
      <dt>일별 행 수</dt><dd>${state.daily_readings.length}</dd>
      <dt>현재 값</dt><dd>${state.current_reading ? `${state.current_reading.normalized_value}${state.current_reading.unit}` : "—"}</dd>
      <dt>전일 대비</dt><dd>${state.last_comparison?.state === "comparable" ? `${state.last_comparison.direction} ${state.last_comparison.magnitude}${state.last_comparison.unit}` : state.last_comparison?.state ?? "—"}</dd>
    </dl>
    <div class="raw-view">${escapeHtml(JSON.stringify({ daily_readings: state.daily_readings.map((r) => [r.record_date, r.normalized_value]), status }, null, 2))}</div>
  `;
}

function buildSyntheticPanel() {
  const panel = document.getElementById("synthetic-panel");
  panel.innerHTML = `
    <div class="synthetic-buttons">
      <button data-action="success">① 정상 순서 재생 (D1-A→D1-B→D2)</button>
      ${FAILURE_IDS.map((id) => `<button data-action="fail" data-id="${id}">실패: ${id.replace("T04-", "")}</button>`).join("")}
      <button data-action="recover" class="recover-btn">다시 시도 · 합성 복구 (RECOVER-D2)</button>
    </div>
    <div id="synthetic-result" hidden></div>
  `;

  panel.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        if (btn.dataset.action === "success") {
          renderSyntheticResult("정상 순서 (D1-A→D1-B→D2)", await runSuccessSequence());
        } else if (btn.dataset.action === "fail") {
          renderSyntheticResult(`실패 재생 (${btn.dataset.id})`, await runFailureSequence(btn.dataset.id));
        } else if (btn.dataset.action === "recover") {
          renderSyntheticResult("오류 뒤 회복 (TIMEOUT→RECOVER-D2)", await runRecoverySequence());
        }
      } catch (err) {
        const box = document.getElementById("synthetic-result");
        box.hidden = false;
        box.innerHTML = `<span class="status-badge error">● 재생 실패</span><p class="hint">${escapeHtml(err.message)}</p>`;
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function main() {
  buildSyntheticPanel();
  try {
    const state = await loadRealState();
    renderMainCard(state);
    renderDailyTable(state);
  } catch (err) {
    document.getElementById("main-card").innerHTML = `<span class="status-badge error">● 로딩 실패</span><p class="hint">${escapeHtml(err.message)}</p>`;
  }
}

main();
