/* ============================================================
 * 광고 리포트 필드 진단기 — collect-ads-fields.js
 *
 * 목적: 애드팝콘 SSP 리포트 응답에 "PV" 관련 필드가 있는지 확인.
 *       (RPM = 총광고수익 / 총PV * 1000 을 계산하려면 PV가 필요)
 *
 * 사용법:
 *  1) console.adpopcorn.com 의 '앱 리포트' 에 로그인
 *  2) F12 → Console → 이 파일 내용 전체 붙여넣고 Enter
 *  3) 우측 상단 결과창 확인 + 콘솔에 전체 필드 출력됨
 *  4) 결과창/콘솔 내용을 캡처해서 전달
 * ============================================================ */
(async function () {
  'use strict';
  if (!location.host.includes('console.adpopcorn.com')) { alert('console.adpopcorn.com (앱 리포트)에서 실행해주세요.'); return; }
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:999999;background:#0c1a14;color:#e9f1ed;border:1px solid #2fb87f;border-radius:14px;padding:16px 20px;font:12px/1.6 -apple-system,Pretendard,sans-serif;box-shadow:0 8px 40px rgba(0,0,0,.5);max-width:440px;max-height:80vh;overflow:auto';
  box.innerHTML = '<b style="color:#3ddc97">🔎 광고 필드 진단</b><div id="cf2" style="margin-top:8px;color:#9fb4ab"></div>';
  document.body.appendChild(box);
  const log = m => box.querySelector('#cf2').innerHTML = m;

  // 1) 요청(토큰+필터 body) 캡처: XHR 후킹 + [조회하기] 자동 클릭
  window.__SSPREQ = null;
  const oSend = XMLHttpRequest.prototype.send, oOpen = XMLHttpRequest.prototype.open, oSet = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; this.__h = {}; return oOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.__h[k] = v; return oSet.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) { try { if (String(this.__u).includes('/report')) { window.__SSPREQ = { url: this.__u, token: this.__h.Authorization || this.__h.authorization, body: b }; } } catch (e) {} return oSend.apply(this, arguments); };
  log('요청 정보 확인 중… (조회 자동 클릭)');
  const go = [...document.querySelectorAll('button')].find(b => b.textContent.trim().includes('조회'));
  if (go) go.click();
  await new Promise(r => setTimeout(r, 3500));
  if (!window.__SSPREQ || !window.__SSPREQ.body) { box.innerHTML = '<b style="color:#ff6b6b">요청 캡처 실패</b><div style="margin-top:6px;color:#9fb4ab">앱 리포트에서 [조회하기]를 한 번 누른 뒤 다시 실행해주세요.</div>'; return; }
  const base = JSON.parse(window.__SSPREQ.body);
  const reqUrl = window.__SSPREQ.url || 'https://sspi-op-prod.adpopcorn.com/report';
  const mk = { method: 'POST', headers: { Authorization: window.__SSPREQ.token, 'Content-Type': 'application/json', Accept: 'application/json' } };

  // 2) 최근 구간으로 한 번만 호출해서 응답 전체 구조를 뜯어본다
  log('리포트 응답 분석 중…');
  let j;
  try {
    j = await (await fetch(reqUrl, Object.assign({}, mk, { body: JSON.stringify(base) }))).json();
  } catch (e) { box.innerHTML = '<b style="color:#ff6b6b">호출 실패: ' + e.message + '</b>'; return; }

  // 3) 전체 키 재귀 수집
  const flat = {};
  function walk(o, pre) { if (!o || typeof o !== 'object') return; for (const k in o) { const v = o[k]; const key = pre ? pre + '.' + k : k; if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key); else if (Array.isArray(v)) { flat[key + '[]'] = true; if (v[0] && typeof v[0] === 'object') walk(v[0], key + '[0]'); else flat[key + '[0]'] = typeof (v[0]); } else flat[key] = String(v).slice(0, 40); } }
  walk(j, '');
  const allKeys = Object.keys(flat).sort();

  // report row 의 키 (있으면)
  const rep = (j.data && j.data.report) || (Array.isArray(j.data) ? j.data : []);
  const rowKeys = rep && rep[0] ? Object.keys(rep[0]) : [];
  const sampleRow = rep && rep[0] ? rep[0] : null;

  // PV/뷰 후보 검색
  const pvHits = allKeys.filter(k => /pv|view|impression|render|imp\b|page/i.test(k));

  // 콘솔에 전체 출력
  console.log('%c=== 광고 리포트 필드 진단 ===', 'color:#3ddc97;font-weight:bold');
  console.log('요청 URL:', reqUrl);
  console.log('요청 body:', base);
  console.log('report row 키:', rowKeys);
  console.log('sample row:', sampleRow);
  console.log('전체 키(flatten):', allKeys);
  console.log('PV/뷰/노출 후보 키:', pvHits);
  console.log('전체 응답 JSON:', j);

  // 결과창 표시
  const esc = s => String(s).replace(/</g, '&lt;');
  box.innerHTML = '<b style="color:#3ddc97">🔎 광고 필드 진단 완료</b>' +
    '<div style="margin-top:10px"><b style="color:#f5c451">report row 키 (' + rowKeys.length + '개)</b><br><span style="color:#cfe;font-family:monospace;font-size:11px">' + esc(rowKeys.join(', ')) + '</span></div>' +
    '<div style="margin-top:10px"><b style="color:#f5c451">PV/노출/뷰 후보</b><br><span style="color:#3ddc97;font-family:monospace;font-size:11px">' + (pvHits.length ? esc(pvHits.join(', ')) : '없음 ❌') + '</span></div>' +
    '<div style="margin-top:10px"><b style="color:#f5c451">sample row</b><br><span style="color:#9fb4ab;font-family:monospace;font-size:10.5px;word-break:break-all">' + esc(JSON.stringify(sampleRow)).slice(0, 900) + '</span></div>' +
    '<div style="margin-top:10px;color:#9fb4ab;font-size:11px">전체 필드는 <b>F12 콘솔</b>에 출력됨. 콘솔 캡처해서 전달해주세요.</div>';
})();
