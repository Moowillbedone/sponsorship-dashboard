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

let DATA=null; const built={};

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
function sectionHead(t,hint){ return `<div class="section-head"><h2>${t}</h2>${hint?`<span class="hint">${hint}</span>`:''}</div>`; }
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
    ${sectionHead('일별 적립 vs 사용 추이','젬이 어떻게 쌓이고 소비되는지')}
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
    </div>`;
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
    ${sectionHead('일별 후원 추이','그리퍼들이 받는 후원의 흐름')}
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
    </div>`;
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
    ${sectionHead('일별 매출 추이','인앱 결제 흐름')}
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
    </div>`;
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
}

/* ---------- tabs ---------- */
const VIEWS = { gems:buildGems, spons:buildSpons, purch:buildPurch };
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
  m.innerHTML=`<div class="modal">
    <div class="modal-head"><b>데이터 갱신하기</b><button class="modal-x" id="rg-x">✕</button></div>
    <p class="modal-desc">어드민 API는 사내 인증이 필요해 <b>어드민에 로그인한 브라우저</b>에서 직접 수집합니다. 아래 순서로 최신 데이터를 반영하세요. (약 2~3분)</p>
    <ol class="modal-steps">
      <li><b>admin2.grip.show</b> 에 로그인</li>
      <li><b>F12 → Console</b> 탭 열기</li>
      <li>아래 <b>수집 스크립트 복사</b> → 콘솔에 붙여넣고 Enter <span class="modal-dim">(붙여넣기가 막히면 <code>allow pasting</code> 입력 후 재시도)</span></li>
      <li>자동 다운로드된 <code>gem-snapshot.json</code> 을 레포 <code>data/snapshot.json</code> 으로 교체</li>
      <li><code>git push</code> → 1~2분 후 자동 재배포·반영</li>
    </ol>
    <div class="modal-actions">
      <button class="btn-primary" id="rg-copy">📋 수집 스크립트 복사</button>
      <a class="btn-ghost" href="collect.js" download>파일 다운로드</a>
      <button class="btn-ghost" id="rg-reload">페이지 새로고침</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  const close=()=>m.remove();
  m.addEventListener('click',e=>{ if(e.target===m) close(); });
  document.getElementById('rg-x').onclick=close;
  document.getElementById('rg-reload').onclick=()=>location.reload();
  document.getElementById('rg-copy').onclick=async()=>{
    try{ const t=await (await fetch('collect.js?t='+Date.now())).text(); await navigator.clipboard.writeText(t); toast('수집 스크립트를 복사했습니다. 어드민 콘솔에 붙여넣으세요.'); }
    catch(e){ toast('복사 실패 — 옆의 파일 다운로드를 이용하세요.', true); }
  };
}

/* ---------- init ---------- */
async function init(){
  try{
    const r = await fetch('data/snapshot.json?t='+Date.now());
    DATA = await r.json();
    renderMeta(); renderGems(); renderSpons(); renderPurch();
    buildGems(); built.gems=true;
    $('#loading').style.display='none';
    setupTabs(); setupRefresh();
  }catch(e){
    $('#loading').textContent = '데이터를 불러오지 못했습니다: '+e.message;
  }
}
init();
