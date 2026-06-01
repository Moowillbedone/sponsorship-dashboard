/* 후원하기 대시보드 — Gem Analytics */
'use strict';

/* ---------- number format ---------- */
const fmt = n => Math.round(n||0).toLocaleString('ko-KR');
const fmtKor = n => {
  n = n||0; const s = n<0?'-':''; n=Math.abs(n);
  if(n>=1e8) return s+(n/1e8).toFixed(n>=1e9?0:1).replace(/\.0$/,'')+'억';
  if(n>=1e4) return s+Math.round(n/1e4).toLocaleString('ko-KR')+'만';
  return s+n.toLocaleString('ko-KR');
};
const pct = (n,d)=> d? (n/d*100):0;
const MD = iso => iso ? iso.slice(5) : '';
const fmt2 = n => (n||0).toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2});
const won = n => fmt(n)+'원';   // 0원 단위 정확 표기

/* ---------- palette ---------- */
const C = {
  mint:'#3ddc97', mintSoft:'#2fb87f', blue:'#5aa9e6', amber:'#f5c451',
  red:'#ff6b6b', violet:'#a78bfa', dim:'#5e7269', pink:'#f48fb1', teal:'#4dd0c4'
};
const TYPE_COLORS = { '적립':C.mint,'사용':C.blue,'만료':C.amber,'적립취소':C.violet,'사용취소':C.pink,'회수':C.red };
const STATE_LABEL = { SPONSORED:'후원 완료', ALL_CANCELED:'후원 취소', PARTIAL_CANCELED:'부분 취소', PURCHASED:'결제 완료', CANCELED:'결제 취소', REFUNDED:'환불' };
const STATE_COLORS = { SPONSORED:C.mint, ALL_CANCELED:C.red, PARTIAL_CANCELED:C.amber, PURCHASED:C.mint, CANCELED:C.red, REFUNDED:C.amber };
const STORE_LABEL = { GOOGLE_PLAY:'Google Play', APP_STORE:'App Store', ONE_STORE:'원스토어' };
const STORE_COLORS = { GOOGLE_PLAY:C.mint, APP_STORE:C.blue, ONE_STORE:C.amber };

/* ---------- Chart.js global ---------- */
Chart.defaults.color = C.dim;
Chart.defaults.font.family = "Pretendard,'Pretendard Variable',sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.borderColor = 'rgba(255,255,255,.05)';
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = '#0c1a14';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,.12)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 11;
Chart.defaults.plugins.tooltip.cornerRadius = 9;
Chart.defaults.plugins.tooltip.titleColor = '#e9f1ed';
Chart.defaults.plugins.tooltip.bodyColor = '#9fb4ab';
Chart.defaults.plugins.tooltip.titleFont = {weight:'700',size:12};
Chart.defaults.plugins.tooltip.boxPadding = 5;
Chart.defaults.maintainAspectRatio = false;

let DATA=null, ADS=null; const built={};

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
function gradient(ctx, hex){
  const g = ctx.createLinearGradient(0,0,0,260);
  g.addColorStop(0, hex+'55'); g.addColorStop(1, hex+'02'); return g;
}
function kpi(label, value, unit, sub, accent){
  return `<div class="kpi" style="--accent:${accent||C.mint}">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value">${value}${unit?`<span class="unit">${unit}</span>`:''}</div>
    ${sub?`<div class="kpi-sub">${sub}</div>`:''}</div>`;
}
function tip(text){ return text?`<span class="tip" tabindex="0" data-tip="${esc(text)}">i</span>`:''; }
function sectionHead(t,hint,tipText){ return `<div class="section-head"><h2>${t}${tip(tipText)}</h2>${hint?`<span class="hint">${hint}</span>`:''}</div>`; }
function rankList(rows, valFn, accent){
  return `<div class="rank">`+rows.map((r,i)=>`
    <div class="rank-row">
      <div class="rank-no">${i+1}</div>
      <div class="rank-name">${esc(r.name||'(이름없음)')}<span class="seq">#${r.userSeq}</span></div>
      <div class="rank-val" style="color:${i<3?accent:'var(--text)'}">${valFn(r)}</div>
      <div class="rank-cnt">${fmt(r.count)}건</div>
    </div>`).join('')+`</div>`;
}
function barList(rows, max){
  const mx = max || Math.max(...rows.map(r=>r.value),1);
  return `<div class="barlist">`+rows.map(r=>`
    <div class="barlist-row">
      <div class="barlist-label" title="${esc(r.label)}">${esc(r.label)}</div>
      <div class="barlist-track"><div class="barlist-fill" style="width:${(r.value/mx*100).toFixed(1)}%;${r.color?`background:linear-gradient(90deg,${r.color}88,${r.color})`:''}"></div></div>
      <div class="barlist-val">${r.disp||fmt(r.value)}</div>
    </div>`).join('')+`</div>`;
}
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function legend(items){ return `<div class="legend">`+items.map(i=>`<div class="legend-item"><span class="legend-dot" style="background:${i.color}"></span>${i.label}</div>`).join('')+`</div>`; }

/* ---------- 기간별 리스트 (일/주/월 토글 + 페이지네이션) ---------- */
const periodState={}, PERIOD_CFG={};
const _p2=n=>String(n).padStart(2,'0');
function weekKey(ds){ const d=new Date(ds+'T00:00:00'); const day=d.getDay(); d.setDate(d.getDate()+(day===0?-6:1-day)); return d.getFullYear()+'-'+_p2(d.getMonth()+1)+'-'+_p2(d.getDate()); }
function aggPeriod(daily, period, fields){
  if(period==='day') return daily.map(d=>Object.assign({key:d.date}, d));
  const g={};
  for(const row of daily){ const k=period==='week'?weekKey(row.date):row.date.slice(0,7); if(!g[k]){g[k]={key:k}; fields.forEach(f=>g[k][f]=0);} fields.forEach(f=>g[k][f]+=(row[f]||0)); }
  return Object.values(g).sort((a,b)=>a.key<b.key?-1:1);
}
function setupPeriod(key, daily, fields){ PERIOD_CFG[key]={daily,fields}; if(!periodState[key]) periodState[key]={period:'day',page:0}; }
function periodHTML(key, title){
  return `<div class="card period-card">
    <div class="card-head"><div class="card-title">${title||'기간별 리스트'}</div>
      <div class="period-toggle">
        <button class="ptab active" data-pk="${key}" data-pv="day">일별</button>
        <button class="ptab" data-pk="${key}" data-pv="week">주별</button>
        <button class="ptab" data-pk="${key}" data-pv="month">월별</button>
      </div></div>
    <div id="ptable-${key}"></div>
  </div>`;
}
function renderPeriodTable(key){
  const cfg=PERIOD_CFG[key], st=periodState[key]; if(!cfg||!document.getElementById('ptable-'+key)) return;
  const rows=aggPeriod(cfg.daily, st.period, cfg.fields.map(f=>f.f)).reverse();
  const PER=14, pages=Math.max(1,Math.ceil(rows.length/PER));
  if(st.page>=pages) st.page=pages-1; if(st.page<0) st.page=0;
  const pr=rows.slice(st.page*PER,(st.page+1)*PER);
  const dlabel=st.period==='month'?'월':st.period==='week'?'주 시작':'날짜';
  const head=`<div class="ptable-row ptable-head"><div>${dlabel}</div>${cfg.fields.map(f=>`<div>${f.label}</div>`).join('')}</div>`;
  const body=pr.map(r=>`<div class="ptable-row"><div class="ptable-date">${r.key}</div>${cfg.fields.map(f=>`<div>${(f.fmt||fmt)(r[f.f]||0)}</div>`).join('')}</div>`).join('');
  const pager=pages>1?`<div class="pager"><button class="pgbtn" data-pk="${key}" data-pg="${st.page-1}" ${st.page===0?'disabled':''}>‹</button><span>${st.page+1} / ${pages} · 총 ${rows.length}</span><button class="pgbtn" data-pk="${key}" data-pg="${st.page+1}" ${st.page>=pages-1?'disabled':''}>›</button></div>`:`<div class="pager"><span>총 ${rows.length}건</span></div>`;
  document.getElementById('ptable-'+key).innerHTML=`<div class="ptable" style="grid-template-columns:minmax(84px,1.1fr) repeat(${cfg.fields.length},1fr)">${head}${body}</div>${pager}`;
}
let __pBound=false;
function bindPeriodEvents(){
  if(__pBound) return; __pBound=true;
  document.addEventListener('click', e=>{
    const tb=e.target.closest('button[data-pv]');
    if(tb){ const k=tb.dataset.pk; periodState[k].period=tb.dataset.pv; periodState[k].page=0; document.querySelectorAll(`button[data-pk="${k}"][data-pv]`).forEach(b=>b.classList.toggle('active',b===tb)); renderPeriodTable(k); return; }
    const pg=e.target.closest('button[data-pg]');
    if(pg && !pg.disabled){ const k=pg.dataset.pk; periodState[k].page=+pg.dataset.pg; renderPeriodTable(k); }
  });
}

/* ---------- AI 어드바이저 (데이터 기반 동적 분석 · 갱신 시 자동 변경) ---------- */
function trend(daily, field, win){
  win=win||14; const n=daily.length; if(n<win+3) return null;
  const recent=daily.slice(-win).reduce((a,b)=>a+(+b[field]||0),0);
  const prev=daily.slice(-win*2,-win).reduce((a,b)=>a+(+b[field]||0),0);
  if(!prev) return null; return (recent-prev)/prev*100;
}
function tBadge(p){ if(p==null) return ''; const up=p>=0; return `<span class="adv-trend ${up?'up':'down'}">${up?'▲':'▼'}${Math.abs(p).toFixed(0)}%</span>`; }
function advisor(key){
  const items=[]; const P=n=>n.toFixed(1)+'%';
  if(key==='gems'){
    const g=DATA.gems,k=g.kpi; const useRate=k.accrualAmt?k.useAmt/k.accrualAmt*100:0, expRate=k.accrualAmt?k.expireAmt/k.accrualAmt*100:0;
    const tAcc=trend(g.daily,'ACCRUAL'),tUse=trend(g.daily,'USE');
    items.push(['insight',`적립 젬의 <b>${P(useRate)}</b>가 사용됨 — 젬이 ${useRate>80?'활발히 순환되는 건전한':'다소 정체된'} 경제 ${tBadge(tAcc)}`]);
    items.push(['insight',`사용처의 대부분이 <b>후원</b> — 젬의 핵심 효용은 그리퍼 후원이며 그 외 소비처는 미미`]);
    if(expRate>1) items.push(['bad',`적립 대비 <b>${P(expRate)}</b>가 만료 소멸 — 유효기간 임박 알림·만료예정 이벤트로 추가 소비를 유도하면 사장되는 젬을 후원으로 전환 가능`]);
    else items.push(['good',`만료율 ${P(expRate)}로 낮음 — 발행된 젬이 사장되지 않고 잘 소비됨`]);
    items.push(['todo',`광고미션 적립이 압도적 → <b>광고 인벤토리 확대</b>가 곧 젬 발행량↑ = 후원 잠재력↑`]);
    if(useRate<75) items.push(['todo',`적립 대비 소비 ${P(useRate)} → 후원 외 소비처(굿즈·뱃지·부스팅) 확대로 순환 가속`]);
    if(tUse!=null) items.push(['impact',`최근 2주 젬 사용 ${tBadge(tUse)} — ${tUse>=0?'후원 활성화가 지속되는 긍정 신호':'후원 동력 약화 신호 → 한정 후원 이벤트로 부양 필요'}`]);
    items.push(['impact',`적립>사용으로 쌓인 미사용 잔액은 <b>잠재 후원 여력</b> — 소비 전환을 자극하면 그리퍼 매출로 직결`]);
  } else if(key==='spons'){
    const s=DATA.spons,k=s.kpi; const cancel=k.cancelRate*100;
    const perG=k.uniqueGrippers?k.confirmedAmt/k.uniqueGrippers:0, perS=k.uniqueSponsors?k.confirmedAmt/k.uniqueSponsors:0;
    const top10=s.topGrippers.slice(0,10).reduce((a,b)=>a+b.amount,0), top10R=k.confirmedAmt?top10/k.confirmedAmt*100:0;
    const tAmt=trend(s.daily,'amount');
    items.push(['insight',`후원 취소율 <b>${P(cancel)}</b> — ${cancel<1?'매우 안정적, 후원 경험 신뢰도가 높음':'다소 높아 점검 필요'} ${tBadge(tAmt)}`]);
    items.push(['insight',`그리퍼 1인 평균 <b>${fmtKor(perG)}젬</b> 수령 · 후원자 1인 평균 <b>${fmtKor(perS)}젬</b> 후원`]);
    if(top10R>50) items.push(['bad',`상위 10 그리퍼가 후원의 <b>${P(top10R)}</b> 차지 — 소수 의존 리스크, 중간층 그리퍼 육성 필요`]);
    else items.push(['good',`상위 10 그리퍼 비중 ${P(top10R)} — 후원이 비교적 여러 그리퍼에 분산됨`]);
    items.push(['todo',`Top 그리퍼 리텐션 케어 + 신규 그리퍼 온보딩(첫 후원 매칭)으로 후원 저변 확대`]);
    items.push(['todo',`후원자 ${fmt(k.uniqueSponsors)}명 → 미후원 활성 유저 대상 <b>첫 후원 보너스 젬</b>으로 전환 유도`]);
    if(tAmt!=null) items.push(['impact',`최근 2주 후원액 ${tBadge(tAmt)} — ${tAmt>=0?'후원 생태계 성장 중':'하락 추세, 라이브 연계 후원 이벤트로 부양 권장'}`]);
  } else if(key==='purch'){
    const p=DATA.purch,k=p.kpi; const arppu=k.uniqueBuyers?k.totalPrice/k.uniqueBuyers:0;
    const goog=p.byStore.find(x=>x.store==='GOOGLE_PLAY'),googR=goog&&k.totalPrice?goog.price/k.totalPrice*100:0;
    const tPrice=trend(p.daily,'price');
    items.push(['insight',`구매자 1인 평균 결제(ARPPU) <b>${fmtKor(arppu)}원</b> · 평균 객단가 ${fmt(k.avgPrice)}원 ${tBadge(tPrice)}`]);
    items.push(['insight',`유료 충전 젬은 광고 적립과 함께 <b>후원 실탄</b>의 두 축 — 결제는 회사 직접 매출`]);
    if(googR>60) items.push(['bad',`Google Play 매출 비중 <b>${P(googR)}</b> — iOS 결제 전환이 상대적으로 낮음, iOS 충전 UX 개선 여지`]);
    items.push(['todo',`고액 결제 Top 유저 = 핵심 과금층 → VIP 혜택·한정 젬 패키지로 LTV 극대화`]);
    items.push(['todo',`무료 적립→유료 충전 전환 퍼널 최적화로 구매자 수 자체를 확대`]);
    if(tPrice!=null) items.push(['impact',`최근 2주 결제 매출 ${tBadge(tPrice)} — 직접 매출 ${tPrice>=0?'성장세':'둔화, 충전 프로모션 타이밍'}`]);
  } else if(key==='ads'){
    const sk=ADS.sdk.kpi,sp=ADS.ssp.kpi,cp=ADS.coupang; const sspKrw=Math.round(sp.totalCost*1400),cpRev=cp?cp.kpi.totalClientCommission:0;
    const total=sk.totalRevenue+sspKrw+cpRev; const tSdk=trend(ADS.sdk.daily,'revenue');
    items.push(['insight',`광고 총수익 약 <b>${fmtKor(total)}원</b> = SDK ${fmtKor(sk.totalRevenue)} + SSP ${fmtKor(sspKrw)} + 쿠팡 ${fmtKor(cpRev)} ${tBadge(tSdk)}`]);
    items.push(['insight',`오퍼월(SDK)은 유저가 광고 보고 <b>젬 적립</b> → 후원 순환의 입구. 광고수익+젬발행 1석2조`]);
    if(cp){ const cvr=cp.kpi.totalClick?cp.kpi.totalConversion/cp.kpi.totalClick*100:0; items.push(['good',`쿠팡 파트너스 구매전환율 <b>${P(cvr)}</b>, 38일만에 ${fmtKor(cpRev)}원 — 신규 수익원으로 빠르게 안착`]); }
    items.push(['bad',`SSP eCPM $${(sp.totalImpression?sp.totalCost/sp.totalImpression*1000:0).toFixed(2)} — 미디에이션 단가 최적화(네트워크 추가·플로어 조정) 여지`]);
    items.push(['todo',`오퍼월 노출↑ = 젬 발행↑ = 후원 실탄↑ → 광고 인벤토리 확대가 후원 생태계까지 키우는 핵심 레버`]);
    items.push(['impact',`광고는 <b>유저 비용 부담 0</b>의 순수익 — 트래픽(활성)만 늘면 매출이 비례하는 고마진 구조`]);
  }
  const icon={insight:'💡',good:'✅',bad:'⚠️',todo:'🎯',impact:'🚀'}, lab={insight:'핵심 인사이트',good:'강점',bad:'주의·약점',todo:'개선 액션',impact:'비즈니스 임팩트'};
  const grp={}; items.forEach(([t,x])=>{(grp[t]=grp[t]||[]).push(x);});
  const ord=['insight','good','bad','todo','impact'];
  return `<div class="card advisor"><div class="card-head"><div class="card-title">🤖 AI 어드바이저</div><div class="card-meta">데이터 기반 자동 분석 · 갱신 시 자동 변경</div></div>
    <div class="adv-grid">${ord.filter(t=>grp[t]).map(t=>`<div class="adv-block adv-${t}"><div class="adv-h">${icon[t]} ${lab[t]}</div><ul>${grp[t].map(x=>`<li>${x}</li>`).join('')}</ul></div>`).join('')}</div></div>`;
}

function lineChart(id, labels, datasets){
  const cv=document.getElementById(id); if(!cv) return; const ctx=cv.getContext('2d');
  datasets.forEach(d=>{ if(d.fill) d.backgroundColor=gradient(ctx,d._c); d.borderColor=d._c; d.borderWidth=2; d.tension=.35; d.pointRadius=0; d.pointHoverRadius=4; d.pointHoverBackgroundColor=d._c; d.pointHoverBorderColor='#08110d'; d.pointHoverBorderWidth=2; });
  return new Chart(ctx,{type:'line',data:{labels,datasets},options:{
    interaction:{mode:'index',intersect:false},
    scales:{ x:{grid:{display:false},ticks:{maxTicksLimit:8,maxRotation:0}}, y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{callback:v=>fmtKor(v)},border:{display:false}} },
    plugins:{tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)}`}}}
  }});
}
function doughnutChart(id, labels, values, colors){
  const cv=document.getElementById(id); if(!cv) return;
  return new Chart(cv.getContext('2d'),{type:'doughnut',data:{labels,datasets:[{data:values,backgroundColor:colors,borderColor:'#0a1712',borderWidth:2,hoverOffset:6}]},options:{
    cutout:'66%',plugins:{tooltip:{callbacks:{label:c=>{const t=c.dataset.data.reduce((a,b)=>a+b,0);return ` ${c.label}: ${fmt(c.parsed)} (${pct(c.parsed,t).toFixed(1)}%)`;}}}}
  }});
}
function barChart(id, labels, values, color, opts){
  opts=opts||{}; const cv=document.getElementById(id); if(!cv) return; const ctx=cv.getContext('2d');
  const bg = opts.perBar ? color : labels.map(()=>color);
  return new Chart(ctx,{type:'bar',data:{labels,datasets:[{data:values,backgroundColor:bg,borderRadius:5,maxBarThickness:opts.thick||30}]},options:{
    scales:{x:{grid:{display:false},ticks:{maxTicksLimit:opts.maxTicks||24}},y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{callback:v=>fmtKor(v)},border:{display:false}}},
    plugins:{tooltip:{callbacks:{label:c=>` ${opts.unit==='won'?fmt(c.parsed.y)+'원':fmt(c.parsed.y)+(opts.unit||'')}`}}}
  }});
}

/* ---------- META ---------- */
function renderMeta(){
  const m=DATA.meta;
  $('#dateRange').textContent = `${m.dateRange.from} ~ ${m.dateRange.to}`;
  const d=new Date(m.generatedAt);
  const p=n=>String(n).padStart(2,'0');
  $('#updatedAt').textContent = `갱신 ${d.getFullYear()}.${p(d.getMonth()+1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ===================== GEMS ===================== */
function renderGems(){
  const g=DATA.gems, k=g.kpi;
  const usePerAcc = pct(k.useAmt,k.accrualAmt);
  const html = `
    <div class="kpi-grid">
      ${kpi('총 젬 거래', fmt(k.total), '건', `일평균 ${fmt(k.total/g.daily.length)}건`, C.mint)}
      ${kpi('총 적립', fmtKor(k.accrualAmt), '젬', `광고미션·결제·후원 등`, C.mint)}
      ${kpi('총 사용', fmtKor(k.useAmt), '젬', `적립 대비 <span class="pos">${usePerAcc.toFixed(0)}%</span> 소비`, C.blue)}
      ${kpi('순 유통 젬', fmtKor(k.netCirc), '젬', `만료 ${fmtKor(k.expireAmt)} · 회수 ${fmtKor(k.retAmt)}`, C.amber)}
    </div>
    ${advisor('gems')}
    ${sectionHead('일별 적립 vs 사용 추이','젬이 어떻게 쌓이고 소비되는지','젬 = 유저가 광고미션·인앱결제·후원받기로 획득해 후원에 쓰는 앱 내 재화. 적립=획득, 사용=소비(후원 등), 만료=유효기간(약 90일) 경과 소멸. admin2 젬 거래내역(gemHistoryType)을 발생일시 기준으로 일별 집계.')}
    <div class="card">
      <div class="card-head"><div class="card-title">일별 젬 흐름</div><div class="card-meta">${g.daily.length}일 · 단위 젬</div></div>
      <div class="chart-wrap tall"><canvas id="g-daily"></canvas></div>
      ${legend([{label:'적립',color:C.mint},{label:'사용',color:C.blue},{label:'만료',color:C.amber}])}
    </div>
    <div class="grid c2" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><div class="card-title">젬 유형별 분포</div><div class="card-meta">건수 기준</div></div>
        <div class="chart-wrap"><canvas id="g-type"></canvas></div>
        ${legend(g.byType.map(t=>({label:`${t.label} ${fmt(t.count)}`,color:TYPE_COLORS[t.label]||C.dim})))}
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">시간대별 활동</div><div class="card-meta">거래 건수 · 0~23시</div></div>
        <div class="chart-wrap"><canvas id="g-hour"></canvas></div>
      </div>
    </div>
    <div class="grid c2" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><div class="card-title">적립 경로 (참조 유형)</div><div class="card-meta">건수</div></div>
        ${barList(g.byReferrer.map(r=>({label:refLabel(r.referrer),value:r.count,color:C.mint})))}
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">상세 유형</div><div class="card-meta">건수</div></div>
        ${barList(g.byReason.map(r=>({label:r.reason,value:r.count,color:C.teal})))}
      </div>
    </div>
    <div class="grid c2" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><div class="card-title">🏆 Top 적립 유저</div><div class="card-meta">광고미션 등으로 가장 많이 모은</div></div>
        ${rankList(g.topAccrual.slice(0,10), r=>fmtKor(r.amount)+' 젬', C.mint)}
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">🔥 Top 사용 유저</div><div class="card-meta">후원 등에 가장 많이 쓴</div></div>
        ${rankList(g.topUse.slice(0,10), r=>fmtKor(r.amount)+' 젬', C.blue)}
      </div>
    </div>
    ${sectionHead('기간별 젬 추이','일 / 주 / 월 단위 · 단위 젬')}
    ${periodHTML('gems','적립 · 사용 · 만료 · 거래건수')}`;
  $('#view-gems').innerHTML = html;
}
function refLabel(r){ return ({REWARD:'광고 미션',SPONSORSHIP:'후원',PURCHASE:'인앱 결제',MANUAL_GEM:'수기 지급',undefined:'만료 처리'})[r]||r; }
function buildGems(){
  const g=DATA.gems;
  lineChart('g-daily', g.daily.map(d=>MD(d.date)), [
    {label:'적립',data:g.daily.map(d=>d.ACCRUAL),_c:C.mint,fill:true},
    {label:'사용',data:g.daily.map(d=>d.USE),_c:C.blue,fill:false},
    {label:'만료',data:g.daily.map(d=>d.EXPIRED),_c:C.amber,fill:false},
  ]);
  doughnutChart('g-type', g.byType.map(t=>t.label), g.byType.map(t=>t.count), g.byType.map(t=>TYPE_COLORS[t.label]||C.dim));
  barChart('g-hour', g.hourly.map(h=>h.hour), g.hourly.map(h=>h.count), C.mint, {maxTicks:12,unit:'건'});
  setupPeriod('gems', g.daily, [{f:'ACCRUAL',label:'적립',fmt:fmtKor},{f:'USE',label:'사용',fmt:fmtKor},{f:'EXPIRED',label:'만료',fmt:fmtKor},{f:'count',label:'거래건수',fmt:fmt}]);
  renderPeriodTable('gems'); bindPeriodEvents();
}

/* ===================== SPONS ===================== */
function renderSpons(){
  const s=DATA.spons, k=s.kpi;
  const html = `
    <div class="kpi-grid">
      ${kpi('총 후원', fmt(k.total), '건', `완료 ${fmt(k.sponsoredCount)} · 일평균 ${fmt(k.total/s.daily.length)}건`, C.mint)}
      ${kpi('총 후원 젬', fmtKor(k.confirmedAmt), '젬', `취소 ${fmtKor(k.canceledAmt)} 젬`, C.mint)}
      ${kpi('활동 그리퍼', fmt(k.uniqueGrippers), '명', `후원받은 크리에이터 수`, C.violet)}
      ${kpi('후원 유저', fmt(k.uniqueSponsors), '명', `취소율 <span class="${k.cancelRate>0.01?'neg':'pos'}">${(k.cancelRate*100).toFixed(2)}%</span>`, C.blue)}
    </div>
    ${advisor('spons')}
    ${sectionHead('일별 후원 추이','그리퍼들이 받는 후원의 흐름','그리퍼 = 라이브 방송 크리에이터. 유저가 보유 젬으로 그리퍼를 후원한 내역(sponsorships/list)을 후원일시 기준 집계. 후원 젬=확정 후원액(confirmedGemAmount), 취소=후원 취소/부분취소 건. 유저 젬의 "사용"과 정확히 일치(검증됨).')}
    <div class="card">
      <div class="card-head"><div class="card-title">일별 후원 젬 / 건수</div><div class="card-meta">${s.daily.length}일</div></div>
      <div class="chart-wrap tall"><canvas id="s-daily"></canvas></div>
      ${legend([{label:'후원 젬',color:C.mint},{label:'후원 건수',color:C.violet}])}
    </div>
    <div class="grid c2" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><div class="card-title">후원 상태 분포</div><div class="card-meta">건수</div></div>
        <div class="chart-wrap"><canvas id="s-state"></canvas></div>
        ${legend(s.byState.map(t=>({label:`${STATE_LABEL[t.state]||t.state} ${fmt(t.count)}`,color:STATE_COLORS[t.state]||C.dim})))}
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">후원 금액대 분포</div><div class="card-meta">1회 후원 젬 규모별 건수</div></div>
        <div class="chart-wrap"><canvas id="s-dist"></canvas></div>
      </div>
    </div>
    <div class="grid c2" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><div class="card-title">🏆 Top 그리퍼</div><div class="card-meta">가장 많은 후원을 받은 크리에이터</div></div>
        ${rankList(s.topGrippers.slice(0,12), r=>fmtKor(r.amount)+' 젬', C.mint)}
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">💝 Top 후원 유저</div><div class="card-meta">가장 많이 후원한 팬</div></div>
        ${rankList(s.topSponsors.slice(0,12), r=>fmtKor(r.amount)+' 젬', C.violet)}
      </div>
    </div>
    ${sectionHead('기간별 후원 추이','일 / 주 / 월 단위')}
    ${periodHTML('spons','후원젬 · 후원건수 · 취소건')}`;
  $('#view-spons').innerHTML = html;
}
function buildSpons(){
  const s=DATA.spons;
  const cv=document.getElementById('s-daily'); const ctx=cv.getContext('2d');
  new Chart(ctx,{data:{labels:s.daily.map(d=>MD(d.date)),datasets:[
    {type:'line',label:'후원 젬',data:s.daily.map(d=>d.amount),borderColor:C.mint,backgroundColor:gradient(ctx,C.mint),borderWidth:2,tension:.35,pointRadius:0,pointHoverRadius:4,fill:true,yAxisID:'y'},
    {type:'line',label:'후원 건수',data:s.daily.map(d=>d.count),borderColor:C.violet,borderWidth:2,tension:.35,pointRadius:0,pointHoverRadius:4,fill:false,yAxisID:'y1'},
  ]},options:{interaction:{mode:'index',intersect:false},scales:{
    x:{grid:{display:false},ticks:{maxTicksLimit:8,maxRotation:0}},
    y:{position:'left',grid:{color:'rgba(255,255,255,.04)'},ticks:{callback:v=>fmtKor(v)},border:{display:false}},
    y1:{position:'right',grid:{display:false},ticks:{callback:v=>fmt(v)+'건'},border:{display:false}}
  },plugins:{tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)}`}}}}});
  doughnutChart('s-state', s.byState.map(t=>STATE_LABEL[t.state]||t.state), s.byState.map(t=>t.count), s.byState.map(t=>STATE_COLORS[t.state]||C.dim));
  barChart('s-dist', s.amountDist.map(d=>d.bucket), s.amountDist.map(d=>d.count), C.mint, {maxTicks:8,unit:'건'});
  setupPeriod('spons', s.daily, [{f:'amount',label:'후원젬',fmt:fmtKor},{f:'count',label:'후원건수',fmt:fmt},{f:'canceled',label:'취소건',fmt:fmt}]);
  renderPeriodTable('spons'); bindPeriodEvents();
}

/* ===================== PURCH ===================== */
function renderPurch(){
  const p=DATA.purch, k=p.kpi;
  const html = `
    <div class="kpi-grid">
      ${kpi('총 결제', fmt(k.total), '건', `완료 ${fmt(k.purchasedCount)}건`, C.mint)}
      ${kpi('총 매출', fmtKor(k.totalPrice), '원', `일평균 ${fmtKor(k.totalPrice/p.daily.length)}원`, C.mint)}
      ${kpi('판매 젬', fmtKor(k.totalGem), '젬', `유료 충전된 젬`, C.amber)}
      ${kpi('구매 유저', fmt(k.uniqueBuyers), '명', `평균 결제 <b style="color:var(--text)">${fmt(k.avgPrice)}원</b>`, C.blue)}
    </div>
    ${advisor('purch')}
    ${sectionHead('일별 매출 추이','인앱 결제 흐름','유저가 젬을 유료로 충전한 인앱 결제 내역(gem-purchases). 매출=실결제 금액(price, 원), 판매 젬=충전된 젬 수량. 스토어=Google Play/App Store. 광고 적립과 함께 후원 재화(젬)의 두 공급원 중 유료 축이며 회사 직접 매출.')}
    <div class="card">
      <div class="card-head"><div class="card-title">일별 결제 매출 / 건수</div><div class="card-meta">${p.daily.length}일 · 단위 원</div></div>
      <div class="chart-wrap tall"><canvas id="p-daily"></canvas></div>
      ${legend([{label:'매출(원)',color:C.mint},{label:'결제 건수',color:C.blue}])}
    </div>
    <div class="grid c2" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><div class="card-title">스토어별 매출</div><div class="card-meta">결제액 기준</div></div>
        <div class="chart-wrap"><canvas id="p-store"></canvas></div>
        ${legend(p.byStore.map(t=>({label:`${STORE_LABEL[t.store]||t.store} ${fmtKor(t.price)}원`,color:STORE_COLORS[t.store]||C.dim})))}
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">젬 번들별 판매</div><div class="card-meta">상품별 결제 건수</div></div>
        ${barList(p.byBundle.slice(0,8).map(b=>({label:b.bundle,value:b.count,disp:fmt(b.count)+'건',color:C.amber})))}
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-head"><div class="card-title">🏆 Top 결제 유저</div><div class="card-meta">가장 많이 충전한 큰손</div></div>
      <div class="grid c2"><div>${rankList(p.topBuyers.slice(0,6), r=>fmtKor(r.price)+'원', C.mint)}</div><div>${rankList(p.topBuyers.slice(6,12).map((r)=>r), r=>fmtKor(r.price)+'원', C.mint).replace(/rank-no">(\d+)/g,(m,n)=>`rank-no">${+n+6}`)}</div></div>
    </div>
    ${sectionHead('기간별 결제 추이','일 / 주 / 월 단위')}
    ${periodHTML('purch','매출(원) · 결제건수')}`;
  $('#view-purch').innerHTML = html;
}
function buildPurch(){
  const p=DATA.purch;
  const cv=document.getElementById('p-daily'); const ctx=cv.getContext('2d');
  new Chart(ctx,{data:{labels:p.daily.map(d=>MD(d.date)),datasets:[
    {type:'line',label:'매출',data:p.daily.map(d=>d.price),borderColor:C.mint,backgroundColor:gradient(ctx,C.mint),borderWidth:2,tension:.35,pointRadius:0,pointHoverRadius:4,fill:true,yAxisID:'y'},
    {type:'line',label:'건수',data:p.daily.map(d=>d.count),borderColor:C.blue,borderWidth:2,tension:.35,pointRadius:0,pointHoverRadius:4,fill:false,yAxisID:'y1'},
  ]},options:{interaction:{mode:'index',intersect:false},scales:{
    x:{grid:{display:false},ticks:{maxTicksLimit:8,maxRotation:0}},
    y:{position:'left',grid:{color:'rgba(255,255,255,.04)'},ticks:{callback:v=>fmtKor(v)},border:{display:false}},
    y1:{position:'right',grid:{display:false},ticks:{callback:v=>fmt(v)+'건'},border:{display:false}}
  },plugins:{tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)}${c.dataset.label==='매출'?'원':'건'}`}}}}});
  doughnutChart('p-store', p.byStore.map(t=>STORE_LABEL[t.store]||t.store), p.byStore.map(t=>t.price), p.byStore.map(t=>STORE_COLORS[t.store]||C.dim));
  setupPeriod('purch', p.daily, [{f:'price',label:'매출(원)',fmt:fmtKor},{f:'count',label:'결제건수',fmt:fmt}]);
  renderPeriodTable('purch'); bindPeriodEvents();
}

/* ===================== ADS (광고 수익) ===================== */
function renderAds(){
  const sdk=ADS.sdk, ssp=ADS.ssp, cp=ADS.coupang, sk=sdk.kpi, sp=ssp.kpi;
  const eCPM = sp.totalImpression ? (sp.totalCost/sp.totalImpression*1000) : 0;
  const html = `
    <div class="kpi-grid">
      ${kpi('SDK 오퍼월 매출', fmtKor(sk.totalRevenue), '원', `참여완료 ${fmt(sk.totalComplete)}건`, C.mint)}
      ${kpi('SSP 미디에이션', '$'+fmt2(sp.totalCost), '', `≈ ${fmtKor(Math.round(sp.totalCost*1400))}원`, C.violet)}
      ${kpi('SSP 노출수', fmtKor(sp.totalImpression), '회', `클릭 ${fmt(sp.totalClick)} · eCPM $${eCPM.toFixed(3)}`, C.blue)}
      ${kpi('SDK 오퍼월 방문', fmt(sk.totalVisit), '', `참여시도 ${fmt(sk.totalParticipation)}`, C.amber)}
    </div>
    ${advisor('ads')}
    ${sectionHead('애드팝콘 SDK · 오퍼월 광고','유저가 광고 보고 젬 적립 · 단위 원(₩)','오퍼월 = 앱 내 "광고 보고 젬 받기" 미션 지면. 유저가 광고 참여를 완료하면 그립이 받는 광고 수익. partners.adpopcorn.com 기준이며, 매출은 순수익(정산 출금 금액과 정확히 일치 검증). 방문→참여시도→완료 퍼널. PlatformType 1=iOS, 2=Android.')}
    <div class="card">
      <div class="card-head"><div class="card-title">일별 오퍼월 매출 (OS별)</div><div class="card-meta">${sdk.daily.length}일 · 원</div></div>
      <div class="chart-wrap tall"><canvas id="ad-sdk-daily"></canvas></div>
      ${legend([{label:'Android',color:C.mint},{label:'iOS',color:C.blue}])}
    </div>
    <div class="grid c2" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><div class="card-title">OS별 매출 분포</div><div class="card-meta">원</div></div>
        <div class="chart-wrap"><canvas id="ad-sdk-os"></canvas></div>
        ${legend(sdk.byOS.map(o=>({label:`${o.os} ${fmtKor(o.revenue)}원`,color:o.os==='Android'?C.mint:C.blue})))}
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">오퍼월 퍼널</div><div class="card-meta">방문 → 참여 → 완료</div></div>
        ${barList([
          {label:'방문자',value:sk.totalVisit,color:C.amber,disp:fmt(sk.totalVisit)},
          {label:'참여 시도',value:sk.totalParticipation,color:C.teal,disp:fmt(sk.totalParticipation)},
          {label:'참여 완료',value:sk.totalComplete,color:C.mint,disp:fmt(sk.totalComplete)}
        ], Math.max(sk.totalVisit,sk.totalParticipation,sk.totalComplete,1))}
      </div>
    </div>
    ${sectionHead('애드팝콘 SSP · 미디에이션 광고','앱 내 광고 지면 수익 · 단위 USD($)','SSP/미디에이션 = 앱의 배너·전면 등 광고 지면을 여러 광고 네트워크에 경매·중개해 얻는 수익. 순매체비=매체사(그립) 정산액(USD). 요청→응답→노출→클릭 퍼널. eCPM=노출 1,000회당 수익(단가 지표). console.adpopcorn 기준.')}
    <div class="card">
      <div class="card-head"><div class="card-title">일별 순매체비 / 노출수</div><div class="card-meta">${ssp.daily.length}일 · USD</div></div>
      <div class="chart-wrap tall"><canvas id="ad-ssp-daily"></canvas></div>
      ${legend([{label:'순매체비($)',color:C.violet},{label:'노출수',color:C.blue}])}
    </div>
    <div class="grid c2" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><div class="card-title">SSP 광고 퍼널</div><div class="card-meta">요청 → 응답 → 노출 → 클릭</div></div>
        ${barList([
          {label:'요청수',value:sp.totalRequest,color:C.dim,disp:fmtKor(sp.totalRequest)},
          {label:'응답수',value:sp.totalResponse,color:C.blue,disp:fmtKor(sp.totalResponse)},
          {label:'노출수',value:sp.totalImpression,color:C.violet,disp:fmt(sp.totalImpression)},
          {label:'클릭수',value:sp.totalClick,color:C.mint,disp:fmt(sp.totalClick)}
        ], sp.totalRequest||1)}
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">광고 수익 종합</div><div class="card-meta">전체 기간</div></div>
        <div style="padding:6px 2px;font-size:13.5px;line-height:2.4;color:var(--text-mid)">
          SDK 오퍼월: <b style="color:var(--mint)">${fmtKor(sk.totalRevenue)}원</b><br>
          SSP 미디에이션: <b style="color:var(--violet)">$${fmt2(sp.totalCost)}</b> <span style="color:var(--text-dim);font-size:12px">≈ ${fmtKor(Math.round(sp.totalCost*1400))}원</span><br>
          합산 추정: <b style="color:var(--text)">${fmtKor(sk.totalRevenue + Math.round(sp.totalCost*1400))}원</b> <span style="color:var(--text-dim);font-size:12px">(SSP 환율 1,400 가정)</span><br>
          평균 eCPM: <b style="color:var(--blue)">$${eCPM.toFixed(3)}</b>
        </div>
      </div>
    </div>
    ${sectionHead('기간별 광고 매출 (SDK 오퍼월)','일 / 주 / 월 · 단위 원')}
    ${periodHTML('adsdk','매출 · AOS · iOS · 완료')}
    ${sectionHead('기간별 SSP 순매체비','일 / 주 / 월 · 단위 USD')}
    ${periodHTML('adssp','순매체비 · 노출 · 클릭')}
    ${cp ? `
    ${sectionHead('애드팝콘 파트너스 · 쿠팡 광고','유저가 쿠팡 광고로 구매 시 수수료 수익 · 2026-04말 시작 · 단위 원','쿠팡 파트너스(CPS) = 유저가 앱 내 쿠팡 광고를 통해 실제 상품을 구매하면 발생하는 제휴 수수료. 순매체비=우리 최종 수익(client_commission, 거래액의 약 4%). 거래액(GMV)=구매금액-취소금액. 구매전환율=구매수/클릭수. console.adpopcorn 파트너 리포트 기준, 2026년 4월말 도입.')}
    <div class="kpi-grid">
      ${kpi('쿠팡 순매체비', won(cp.kpi.totalClientCommission), '', '우리 최종 수익', C.amber)}
      ${kpi('거래액(GMV)', fmtKor(cp.kpi.totalRevenue), '원', `구매 ${fmt(cp.kpi.totalConversion)}건`, C.mint)}
      ${kpi('클릭 수', fmt(cp.kpi.totalClick), '회', `구매전환 ${(cp.kpi.totalConversion/cp.kpi.totalClick*100).toFixed(1)}%`, C.blue)}
      ${kpi('객단가', fmtKor(cp.kpi.totalConversion?cp.kpi.totalConvRevenue/cp.kpi.totalConversion:0), '원', '구매 1건당 금액', C.violet)}
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">일별 쿠팡 순매체비 / 클릭</div><div class="card-meta">${cp.daily.length}일 · 원</div></div>
      <div class="chart-wrap tall"><canvas id="ad-cp-daily"></canvas></div>
      ${legend([{label:'순매체비(원)',color:C.amber},{label:'클릭수',color:C.blue}])}
    </div>
    ${sectionHead('기간별 쿠팡 파트너스','일 / 주 / 월 · 순매체비 = 우리 수익')}
    ${periodHTML('adcp','순매체비 · 거래액 · 구매 · 클릭')}` : ''}`;
  $('#view-ads').innerHTML = html;
}
function buildAds(){
  const sdk=ADS.sdk, ssp=ADS.ssp;
  lineChart('ad-sdk-daily', sdk.daily.map(d=>MD(d.date)), [
    {label:'Android',data:sdk.daily.map(d=>d.android),_c:C.mint,fill:true},
    {label:'iOS',data:sdk.daily.map(d=>d.ios),_c:C.blue,fill:false}
  ]);
  doughnutChart('ad-sdk-os', sdk.byOS.map(o=>o.os), sdk.byOS.map(o=>o.revenue), sdk.byOS.map(o=>o.os==='Android'?C.mint:C.blue));
  const cv=document.getElementById('ad-ssp-daily'); if(!cv) return; const ctx=cv.getContext('2d');
  new Chart(ctx,{data:{labels:ssp.daily.map(d=>MD(d.date)),datasets:[
    {type:'line',label:'순매체비',data:ssp.daily.map(d=>d.cost),borderColor:C.violet,backgroundColor:gradient(ctx,C.violet),borderWidth:2,tension:.35,pointRadius:0,pointHoverRadius:4,fill:true,yAxisID:'y'},
    {type:'line',label:'노출수',data:ssp.daily.map(d=>d.impression),borderColor:C.blue,borderWidth:2,tension:.35,pointRadius:0,pointHoverRadius:4,fill:false,yAxisID:'y1'}
  ]},options:{interaction:{mode:'index',intersect:false},scales:{
    x:{grid:{display:false},ticks:{maxTicksLimit:8,maxRotation:0}},
    y:{position:'left',grid:{color:'rgba(255,255,255,.04)'},ticks:{callback:v=>'$'+v.toFixed(1)},border:{display:false}},
    y1:{position:'right',grid:{display:false},ticks:{callback:v=>fmtKor(v)},border:{display:false}}
  },plugins:{tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.dataset.label==='순매체비'?'$'+c.parsed.y.toFixed(4):fmt(c.parsed.y)+'회'}`}}}}});
  setupPeriod('adsdk', sdk.daily, [{f:'revenue',label:'매출',fmt:won},{f:'android',label:'AOS',fmt:won},{f:'ios',label:'iOS',fmt:won},{f:'complete',label:'완료',fmt:fmt}]);
  setupPeriod('adssp', ssp.daily, [{f:'cost',label:'순매체비($)',fmt:v=>'$'+fmt2(v)},{f:'impression',label:'노출',fmt:fmt},{f:'click',label:'클릭',fmt:fmt}]);
  if(ADS.coupang){
    const cp=ADS.coupang, cc=document.getElementById('ad-cp-daily');
    if(cc){ const cx=cc.getContext('2d');
      new Chart(cx,{data:{labels:cp.daily.map(d=>MD(d.date)),datasets:[
        {type:'line',label:'순매체비',data:cp.daily.map(d=>d.revenue),borderColor:C.amber,backgroundColor:gradient(cx,C.amber),borderWidth:2,tension:.35,pointRadius:0,pointHoverRadius:4,fill:true,yAxisID:'y'},
        {type:'line',label:'클릭수',data:cp.daily.map(d=>d.click),borderColor:C.blue,borderWidth:2,tension:.35,pointRadius:0,pointHoverRadius:4,fill:false,yAxisID:'y1'}
      ]},options:{interaction:{mode:'index',intersect:false},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8,maxRotation:0}},y:{position:'left',grid:{color:'rgba(255,255,255,.04)'},ticks:{callback:v=>fmtKor(v)},border:{display:false}},y1:{position:'right',grid:{display:false},ticks:{callback:v=>fmt(v)},border:{display:false}}},plugins:{tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.dataset.label==='순매체비'?won(c.parsed.y):fmt(c.parsed.y)+'회'}`}}}}});
    }
    setupPeriod('adcp', cp.daily, [{f:'revenue',label:'순매체비',fmt:won},{f:'grossRevenue',label:'거래액',fmt:won},{f:'conversion',label:'구매',fmt:fmt},{f:'click',label:'클릭',fmt:fmt}]);
  }
  renderPeriodTable('adsdk'); renderPeriodTable('adssp'); if(ADS.coupang) renderPeriodTable('adcp'); bindPeriodEvents();
}

/* ---------- tabs ---------- */
const VIEWS = { ads:buildAds, gems:buildGems, spons:buildSpons, purch:buildPurch };
function showView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.view===name));
  $('#view-'+name).classList.remove('hidden');
  if(!built[name]){ VIEWS[name](); built[name]=true; }
}
function setupTabs(){
  $('#tabs').addEventListener('click', e=>{ const b=e.target.closest('.tab'); if(b) showView(b.dataset.view); });
}

/* ---------- toast ---------- */
let toastT;
function toast(msg, isErr){
  const t=$('#toast'); t.textContent=msg; t.className='toast show'+(isErr?' err':'');
  clearTimeout(toastT); toastT=setTimeout(()=>t.className='toast',2800);
}

/* ---------- refresh / 갱신 안내 ---------- */
function setupRefresh(){
  $('#refreshBtn').addEventListener('click', showRefreshGuide);
}
function showRefreshGuide(){
  if(document.getElementById('rg-modal')) return;
  const m=document.createElement('div'); m.id='rg-modal'; m.className='modal-backdrop';
  m.innerHTML=`<div class="modal" style="max-width:580px">
    <div class="modal-head"><b>데이터 갱신하기</b><button class="modal-x" id="rg-x">✕</button></div>
    <p class="modal-desc"><b>1️⃣ 최초 1회만</b> — 아래 초록 버튼을 브라우저 <b>즐겨찾기 바로 끌어다 놓으세요</b>(드래그). 설치는 한 번이면 끝.</p>
    <div style="text-align:center;margin:6px 0 16px">
      <a class="bookmarklet" href="javascript:(function(){var s=document.createElement('script');s.src='https://sponsorship-dashboard-tau.vercel.app/sync-all.js?t='+Date.now();document.body.appendChild(s);})();" onclick="return false;">🔄 데이터 동기화</a>
      <div class="modal-dim" style="margin-top:7px">↑ 이 버튼을 즐겨찾기 바(주소창 아래 줄)로 <b>드래그</b> (클릭 아님)</div>
    </div>
    <p class="modal-desc"><b>2️⃣ 갱신할 때마다</b> — 아래 사이트에 <b>로그인</b>한 뒤, 즐겨찾기의 <b>'🔄 데이터 동기화'</b>를 클릭하면 끝. 알아서 수집→전송→1~2분 후 대시보드 반영.</p>
    <div class="src-list">
      <div class="src-item"><div class="src-info"><b>젬</b> <span style="color:var(--text-dim);font-size:12px">적립·후원·결제</span> <span class="src-site">admin2.grip.show</span></div></div>
      <div class="src-item"><div class="src-info"><b>광고 SDK</b> <span class="src-site">partners.adpopcorn.com</span></div></div>
      <div class="src-item"><div class="src-info"><b>광고 SSP</b> <span class="src-site">console.adpopcorn.com → 앱 리포트</span></div></div>
      <div class="src-item"><div class="src-info"><b>광고 쿠팡</b> <span class="src-site">console.adpopcorn.com → 파트너 리포트</span></div></div>
    </div>
    <p class="modal-dim" style="margin-top:10px">버튼이 막히면(사이트 보안정책 CSP) 아래 <b>스크립트 복사</b> → 사이트에서 F12 → 콘솔에 붙여넣기 하세요.</p>
    <div class="modal-actions" style="margin-top:14px">
      <button class="btn-mini" data-copy="sync-all.js">📋 스크립트 복사 (콘솔용)</button>
      <button class="btn-ghost" id="rg-reload">새로고침</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  const close=()=>m.remove();
  m.addEventListener('click',e=>{ if(e.target===m) close(); });
  document.getElementById('rg-x').onclick=close;
  document.getElementById('rg-reload').onclick=()=>location.reload();
  m.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{
    try{ const t=await (await fetch(b.dataset.copy+'?t='+Date.now())).text(); await navigator.clipboard.writeText(t); toast(b.dataset.copy+' 복사됨 — 해당 사이트 콘솔에 붙여넣으세요'); }
    catch(e){ toast('복사 실패 — 파일 다운로드를 이용하세요', true); }
  });
}

/* ---------- init ---------- */
async function init(){
  try{
    const [sr,sdkr,sspr,cpr] = await Promise.all([
      fetch('data/snapshot.json?t='+Date.now()),
      fetch('data/ads-sdk.json?t='+Date.now()),
      fetch('data/ads-ssp.json?t='+Date.now()),
      fetch('data/ads-coupang.json?t='+Date.now()).catch(()=>null)
    ]);
    DATA = await sr.json();
    ADS = { meta:{}, sdk: await sdkr.json(), ssp: await sspr.json(), coupang: (cpr && cpr.ok) ? await cpr.json() : null };
    renderMeta(); renderAds(); renderGems(); renderSpons(); renderPurch();
    buildAds(); built.ads=true;
    $('#loading').style.display='none';
    setupTabs(); setupRefresh();
  }catch(e){
    $('#loading').textContent = '데이터를 불러오지 못했습니다: '+e.message;
  }
}
init();
