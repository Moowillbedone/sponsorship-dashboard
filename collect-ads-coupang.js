/* ============================================================
 * 광고 쿠팡 파트너스 수집기 — collect-ads-coupang.js
 *
 * 사용법:
 *  1) console.adpopcorn.com 의 '파트너 리포트(쿠팡)' 에 로그인
 *  2) F12 → Console → 이 파일 내용 전체 붙여넣고 Enter
 *  3) 진행창이 끝나면 ads-coupang.json 자동 다운로드
 *  4) 레포의 data/ads-coupang.json 으로 교체 후 git push → 자동 재배포
 *
 *  ※ 토큰/필터를 잡기 위해 [조회하기]를 자동으로 한 번 누릅니다.
 *    다운로드가 막히면(여러 다운로드 차단) 브라우저 다운로드 허용 후 재실행.
 * ============================================================ */
(async function () {
  'use strict';
  if (!location.host.includes('console.adpopcorn.com')) { alert('console.adpopcorn.com (파트너 리포트)에서 실행해주세요.'); return; }
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:999999;background:#0c1a14;color:#e9f1ed;border:1px solid #f5c451;border-radius:14px;padding:16px 20px;font:13px/1.6 -apple-system,Pretendard,sans-serif;box-shadow:0 8px 40px rgba(0,0,0,.5);min-width:250px';
  box.innerHTML = '<b style="color:#f5c451">🛒 쿠팡 파트너스 수집</b><div id="ccp" style="margin-top:8px;color:#9fb4ab"></div>';
  document.body.appendChild(box);
  const log = m => box.querySelector('#ccp').innerHTML = m;

  // 1) 요청(토큰+body) 캡처: fetch/XHR 후킹 + [조회하기] 자동 클릭
  window.__PREQ = null;
  const of = window.fetch;
  window.fetch = function (input, init) { try { const u = typeof input === 'string' ? input : (input && input.url); if (u && String(u).includes('coupang/report')) { const h = (init && init.headers) || {}; let ho = {}; if (h instanceof Headers) h.forEach((v, k) => ho[k] = v); else ho = Object.assign({}, h); window.__PREQ = { token: ho.Authorization || ho.authorization, body: init && init.body ? String(init.body) : null }; } } catch (e) {} return of.apply(this, arguments); };
  const oSend = XMLHttpRequest.prototype.send, oOpen = XMLHttpRequest.prototype.open, oSet = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; this.__h = {}; return oOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.__h[k] = v; return oSet.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) { try { if (String(this.__u).includes('coupang/report')) { window.__PREQ = { token: this.__h.Authorization || this.__h.authorization, body: b ? String(b) : null }; } } catch (e) {} return oSend.apply(this, arguments); };
  log('요청 정보 확인 중… (조회 자동 클릭)');
  const go = [...document.querySelectorAll('button')].find(b => b.textContent.trim().includes('조회'));
  if (go) go.click();
  await new Promise(r => setTimeout(r, 3000));
  if (!window.__PREQ || !window.__PREQ.body) { box.innerHTML = '<b style="color:#ff6b6b">요청 캡처 실패</b><div style="margin-top:6px;color:#9fb4ab">파트너 리포트에서 [조회하기]를 한 번 누른 뒤 다시 실행해주세요.</div>'; return; }
  const base = JSON.parse(window.__PREQ.body);
  const mk = { method: 'POST', headers: { Authorization: window.__PREQ.token, 'Content-Type': 'application/json', Accept: 'application/json' } };

  // 2) 날짜 구간 (2026-04-01 ~ 오늘, 62일씩, YYYYMMDD) — 쿠팡은 4월말 도입
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  function genRanges() { const out = []; let s = new Date('2026-04-01T00:00:00'); const E = new Date(); while (s <= E) { const e = new Date(s); e.setDate(e.getDate() + 61); if (e > E) e.setTime(E.getTime()); out.push([ymd(s), ymd(e)]); s = new Date(e); s.setDate(s.getDate() + 1); } return out; }
  const ranges = genRanges();
  const daily = {}; let tClick = 0, tConv = 0, tConvRev = 0, tRev = 0, tComm = 0, tCC = 0;
  for (const [s, e] of ranges) {
    log(`수집 ${s} ~ ${e} …`);
    const b = Object.assign({}, base, { start_date: s, end_date: e });
    let ok = false;
    for (let r = 0; r < 4 && !ok; r++) {
      try {
        const j = await (await fetch('https://allapi-live.adpopcorn.com/operation/management/coupang/report', Object.assign({}, mk, { body: JSON.stringify(b) }))).json();
        const rep = j.report || [];
        for (const row of rep) { const d = row.report_date; if (!daily[d]) daily[d] = { click: 0, conversion: 0, convRevenue: 0, grossRevenue: 0, revenue: 0 }; daily[d].click += row.click || 0; daily[d].conversion += row.conversion || 0; daily[d].convRevenue += row.conversion_revenue || 0; daily[d].grossRevenue += row.total_revenue || 0; daily[d].revenue += row.client_commission || 0; tClick += row.click || 0; tConv += row.conversion || 0; tConvRev += row.conversion_revenue || 0; tRev += row.total_revenue || 0; tComm += row.commission || 0; tCC += row.client_commission || 0; }
        ok = true;
      } catch (err) { await new Promise(r => setTimeout(r, 1000)); }
    }
  }

  // 3) 집계 + 다운로드 (순매체비 = client_commission)
  const agg = { kpi: { totalClick: tClick, totalConversion: tConv, totalConvRevenue: tConvRev, totalRevenue: tRev, totalCommission: tComm, totalClientCommission: tCC, days: Object.keys(daily).length }, daily: Object.keys(daily).sort().map(d => ({ date: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), click: daily[d].click, conversion: daily[d].conversion, convRevenue: daily[d].convRevenue, grossRevenue: daily[d].grossRevenue, revenue: daily[d].revenue })) };
  const out = JSON.stringify(agg);
  const blob = new Blob([out], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'ads-coupang.json'; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 200);
  box.innerHTML = '<b style="color:#f5c451">✓ 쿠팡 수집 완료</b><div style="margin-top:8px;color:#9fb4ab">' + agg.daily.length + '일 · 순매체비 ' + tCC.toLocaleString() + '원<br><br><b style="color:#f5c451">ads-coupang.json</b> 다운로드됨.<br>레포 <code>data/ads-coupang.json</code> 교체 후 push 하세요.</div>';
})();
