/* ============================================================
 * 광고 SSP(미디에이션) 수집기 — collect-ads-ssp.js
 *
 * 사용법:
 *  1) console.adpopcorn.com 의 '앱 리포트' 에 로그인
 *  2) F12 → Console → 이 파일 내용 전체 붙여넣고 Enter
 *  3) 우측 상단 진행창이 끝나면 ads-ssp.json 자동 다운로드
 *  4) 레포의 data/ads-ssp.json 으로 교체 후 git push → 자동 재배포
 *
 *  ※ 토큰/필터를 잡기 위해 [조회하기]를 자동으로 한 번 누릅니다.
 *    실패하면 직접 [조회하기]를 누른 뒤 다시 실행하세요.
 * ============================================================ */
(async function () {
  'use strict';
  if (!location.host.includes('console.adpopcorn.com')) { alert('console.adpopcorn.com (앱 리포트)에서 실행해주세요.'); return; }
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:999999;background:#0c1a14;color:#e9f1ed;border:1px solid #2fb87f;border-radius:14px;padding:16px 20px;font:13px/1.6 -apple-system,Pretendard,sans-serif;box-shadow:0 8px 40px rgba(0,0,0,.5);min-width:250px';
  box.innerHTML = '<b style="color:#3ddc97">📺 SSP 광고 수집</b><div id="css2" style="margin-top:8px;color:#9fb4ab"></div>';
  document.body.appendChild(box);
  const log = m => box.querySelector('#css2').innerHTML = m;

  // 1) 요청(토큰+필터 body) 캡처: XHR 후킹 + [조회하기] 자동 클릭
  window.__SSPREQ = null;
  const oSend = XMLHttpRequest.prototype.send, oOpen = XMLHttpRequest.prototype.open, oSet = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; this.__h = {}; return oOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.__h[k] = v; return oSet.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) { try { if (String(this.__u).includes('/report')) { window.__SSPREQ = { token: this.__h.Authorization || this.__h.authorization, body: b }; } } catch (e) {} return oSend.apply(this, arguments); };
  log('요청 정보 확인 중… (조회 자동 클릭)');
  const go = [...document.querySelectorAll('button')].find(b => b.textContent.trim().includes('조회'));
  if (go) go.click();
  await new Promise(r => setTimeout(r, 3000));
  if (!window.__SSPREQ || !window.__SSPREQ.body) { box.innerHTML = '<b style="color:#ff6b6b">요청 캡처 실패</b><div style="margin-top:6px;color:#9fb4ab">앱 리포트에서 [조회하기]를 한 번 누른 뒤 다시 실행해주세요.</div>'; return; }
  const base = JSON.parse(window.__SSPREQ.body);
  const mk = { method: 'POST', headers: { Authorization: window.__SSPREQ.token, 'Content-Type': 'application/json', Accept: 'application/json' } };

  // 2) 날짜 구간 (2025-12-01 ~ 오늘, 62일씩, YYYYMMDD)
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  function genRanges() { const out = []; let s = new Date('2025-12-01T00:00:00'); const E = new Date(); while (s <= E) { const e = new Date(s); e.setDate(e.getDate() + 61); if (e > E) e.setTime(E.getTime()); out.push([ymd(s), ymd(e)]); s = new Date(e); s.setDate(s.getDate() + 1); } return out; }
  const ranges = genRanges();
  const daily = {}; let tCost = 0, tImp = 0, tClick = 0, tReq = 0, tResp = 0;
  for (const [s, e] of ranges) {
    log(`수집 ${s} ~ ${e} …`);
    const b = Object.assign({}, base, { since: s, until: e });
    let ok = false;
    for (let r = 0; r < 4 && !ok; r++) {
      try {
        const j = await (await fetch('https://sspi-op-prod.adpopcorn.com/report', Object.assign({}, mk, { body: JSON.stringify(b) }))).json();
        const rep = (j.data && j.data.report) || [];
        for (const row of rep) { const d = row.ymd, cost = parseFloat(row.media_cost) || 0, imp = parseInt(row.impression) || 0, clk = parseInt(row.click) || 0, req = parseInt(row.request) || 0, resp = parseInt(row.response) || 0; if (!daily[d]) daily[d] = { cost: 0, impression: 0, click: 0, request: 0, response: 0 }; daily[d].cost += cost; daily[d].impression += imp; daily[d].click += clk; daily[d].request += req; daily[d].response += resp; tCost += cost; tImp += imp; tClick += clk; tReq += req; tResp += resp; }
        ok = true;
      } catch (err) { await new Promise(r => setTimeout(r, 1000)); }
    }
  }

  // 3) 집계 + 다운로드
  const agg = { kpi: { totalCost: tCost, totalImpression: tImp, totalClick: tClick, totalRequest: tReq, totalResponse: tResp, days: Object.keys(daily).length }, daily: Object.keys(daily).sort().map(d => ({ date: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), cost: daily[d].cost, impression: daily[d].impression, click: daily[d].click, request: daily[d].request, response: daily[d].response })) };
  const out = JSON.stringify(agg);
  const a = document.createElement('a'); a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(out); a.download = 'ads-ssp.json'; document.body.appendChild(a); a.click(); a.remove();
  box.innerHTML = '<b style="color:#3ddc97">✓ SSP 수집 완료</b><div style="margin-top:8px;color:#9fb4ab">' + agg.daily.length + '일 · 순매체비 $' + tCost.toFixed(2) + '<br><br><b style="color:#3ddc97">ads-ssp.json</b> 다운로드됨.<br>레포 <code>data/ads-ssp.json</code> 교체 후 push 하세요.</div>';
})();
