/* ============================================================
 * 광고 SDK(오퍼월) 수집기 — collect-ads-sdk.js
 *
 * 사용법:
 *  1) partners.adpopcorn.com 의 '매체사 리포트 대시보드' 에 로그인
 *  2) F12 → Console → 이 파일 내용 전체 붙여넣고 Enter
 *  3) 우측 상단 진행창이 끝나면 ads-sdk.json 자동 다운로드
 *  4) 레포의 data/ads-sdk.json 으로 교체 후 git push → 자동 재배포
 *
 *  ※ 토큰을 잡기 위해 잠깐 매체 상세로 이동했다 돌아옵니다(자동).
 *    실패하면 대시보드에서 날짜를 한 번 [조회]한 뒤 다시 실행하세요.
 * ============================================================ */
(async function () {
  'use strict';
  if (!location.host.includes('partners.adpopcorn.com')) { alert('partners.adpopcorn.com (매체사 리포트 대시보드)에서 실행해주세요.'); return; }
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:999999;background:#0c1a14;color:#e9f1ed;border:1px solid #2fb87f;border-radius:14px;padding:16px 20px;font:13px/1.6 -apple-system,Pretendard,sans-serif;box-shadow:0 8px 40px rgba(0,0,0,.5);min-width:250px';
  box.innerHTML = '<b style="color:#3ddc97">📺 SDK 광고 수집</b><div id="cas" style="margin-top:8px;color:#9fb4ab"></div>';
  document.body.appendChild(box);
  const log = m => box.querySelector('#cas').innerHTML = m;

  // 1) 토큰 캡처 (fetch 후킹 + 매체 상세 soft-nav 트리거)
  window.__ADTK = null;
  const of = window.fetch;
  window.fetch = function (input, init) {
    try { const u = typeof input === 'string' ? input : (input && input.url); if (u && String(u).includes('partners-api')) { const h = (init && init.headers) || {}; let ho = {}; if (h instanceof Headers) h.forEach((v, k) => ho[k] = v); else ho = Object.assign({}, h); const a = ho.authorization || ho.Authorization; if (a) window.__ADTK = a; } } catch (e) {}
    return of.apply(this, arguments);
  };
  log('토큰 확인 중…');
  const link = document.querySelector('a[href*="/medias-dashboard/"]');
  if (link) { link.click(); await new Promise(r => setTimeout(r, 1600)); history.back(); await new Promise(r => setTimeout(r, 2000)); }
  else { history.back(); await new Promise(r => setTimeout(r, 1600)); history.forward(); await new Promise(r => setTimeout(r, 1600)); }
  if (!window.__ADTK) { box.innerHTML = '<b style="color:#ff6b6b">토큰 캡처 실패</b><div style="margin-top:6px;color:#9fb4ab">대시보드에서 날짜를 한 번 [조회]한 뒤 다시 실행해주세요.</div>'; return; }
  const H = { headers: { Authorization: window.__ADTK, accept: 'application/json' } };

  // 2) 날짜 구간 (2025-12-01 ~ 오늘, 62일씩 — 애드팝콘 SDK 최대 조회 기간)
  const pad = n => String(n).padStart(2, '0');
  const fmtD = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  function genRanges(startStr) {
    const out = []; let s = new Date(startStr + 'T00:00:00'); const E = new Date();
    while (s <= E) { const e = new Date(s); e.setDate(e.getDate() + 61); if (e > E) e.setTime(E.getTime()); out.push([fmtD(s), fmtD(e)]); s = new Date(e); s.setDate(s.getDate() + 1); }
    return out;
  }
  const ranges = genRanges('2025-12-01');
  const SDK = {};
  for (const [s, e] of ranges) {
    log(`수집 ${s} ~ ${e} …`);
    let ok = false;
    for (let r = 0; r < 4 && !ok; r++) { try { const j = await (await fetch(`https://partners-api.adpopcorn.com/v1/publisher/report/company/daily?startDate=${s}&endDate=${e}`, H)).json(); if (j.Data) Object.assign(SDK, j.Data); ok = true; } catch (err) { await new Promise(r => setTimeout(r, 1000)); } }
  }

  // 3) 집계 (PlatformType 1=iOS, 2=Android)
  log('집계 중…');
  const platMap = { 1: 'iOS', 2: 'Android' };
  let tRev = 0, tVisit = 0, tPart = 0, tComp = 0; const daily = []; const byOS = {};
  for (const date of Object.keys(SDK).sort()) {
    let dRev = 0, dVisit = 0, dPart = 0, dComp = 0; const osRev = {};
    for (const m of SDK[date]) {
      const os = platMap[m.PlatformType] || ('P' + m.PlatformType);
      dRev += m.Revenue || 0; dVisit += m.VisitValue || 0; dPart += m.ParticipationValue || 0; dComp += m.CompleteValue || 0;
      osRev[os] = (osRev[os] || 0) + (m.Revenue || 0);
      (byOS[os] = byOS[os] || { revenue: 0, visit: 0, participation: 0, complete: 0 });
      byOS[os].revenue += m.Revenue || 0; byOS[os].visit += m.VisitValue || 0; byOS[os].participation += m.ParticipationValue || 0; byOS[os].complete += m.CompleteValue || 0;
    }
    daily.push({ date, revenue: Math.round(dRev), visit: dVisit, participation: dPart, complete: dComp, android: Math.round(osRev.Android || 0), ios: Math.round(osRev.iOS || 0) });
    tRev += dRev; tVisit += dVisit; tPart += dPart; tComp += dComp;
  }
  const agg = { kpi: { totalRevenue: Math.round(tRev), totalVisit: tVisit, totalParticipation: tPart, totalComplete: tComp, days: daily.length }, byOS: Object.entries(byOS).map(([os, v]) => ({ os, revenue: Math.round(v.revenue), visit: v.visit, participation: v.participation, complete: v.complete })), daily };

  // 4) 다운로드
  const out = JSON.stringify(agg);
  const a = document.createElement('a'); a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(out); a.download = 'ads-sdk.json'; document.body.appendChild(a); a.click(); a.remove();
  box.innerHTML = '<b style="color:#3ddc97">✓ SDK 수집 완료</b><div style="margin-top:8px;color:#9fb4ab">' + daily.length + '일 · 매출 ' + Math.round(tRev).toLocaleString() + '원<br><br><b style="color:#3ddc97">ads-sdk.json</b> 다운로드됨.<br>레포 <code>data/ads-sdk.json</code> 교체 후 push 하세요.</div>';
})();
