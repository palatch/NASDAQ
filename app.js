// ===== Versioned storage =====
const LS_TRADES='dm_adv_trades_v4';
const LS_CFG='dm_cfg_v4';

function getTrades(){ try{return JSON.parse(localStorage.getItem(LS_TRADES))||[]}catch{return[]} }
function setTrades(v){ localStorage.setItem(LS_TRADES, JSON.stringify(v)); }
function getCfg(){ try{return JSON.parse(localStorage.getItem(LS_CFG))||{}}catch{return{}} }
function setCfg(v){ localStorage.setItem(LS_CFG, JSON.stringify(v)); }

// ===== Config UI =====
(function initCfg(){
  const cfg=getCfg();
  document.getElementById('cfg-finnhub').value = cfg.finnhub||'';
  document.getElementById('cfg-vision').value  = cfg.vision||'';
  document.getElementById('btnSaveCfg').addEventListener('click',()=>{
    setCfg({finnhub:document.getElementById('cfg-finnhub').value.trim(), vision:document.getElementById('cfg-vision').value.trim()});
    alert('บันทึกการตั้งค่าแล้ว ✅');
  });
})();

// ===== Utils =====
const TH_MONTH = {"ม.ค.":1,"ก.พ.":2,"มี.ค.":3,"เม.ย.":4,"พ.ค.":5,"มิ.ย.":6,"ก.ค.":7,"ส.ค.":8,"ก.ย.":9,"ต.ค.":10,"พ.ย.":11,"ธ.ค.":12};
function beToCE(y){ const n=parseInt(y,10); return n>2400? n-543 : 2000+(n%100); }
function parseThaiDate(s){
  const m = s.match(/(\d{1,2})\s+([ก-๙\.]+)\s+(256\d|\d{2}).*?(\d{2}):(\d{2})(?::(\d{2}))?/);
  if(!m) return null;
  const d=String(parseInt(m[1],10)).padStart(2,'0'); const mon=String(TH_MONTH[m[2]]||1).padStart(2,'0');
  const yyyy=String(beToCE(m[3])); const hh=m[4], mm=m[5], ss=m[6]||'00';
  return `${yyyy}-${mon}-${d} ${hh}:${mm}:${ss}`;
}
const toUSD = n => Number.isFinite(n) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n) : '-';

// ===== OCR (Vision optional -> fallback Tesseract) =====
function fileToBase64(file){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result.split(',')[1]); r.onerror=reject; r.readAsDataURL(file); }); }
async function tesseractOCR(file){
  const { createWorker } = Tesseract;
  const worker = await createWorker('eng+tha');
  const { data:{ text } } = await worker.recognize(file);
  await worker.terminate();
  return text;
}
async function visionOCR(file, kind){
  const cfg=getCfg(); if(!cfg.vision) return null;
  const imageBase64 = await fileToBase64(file);
  const r = await fetch(cfg.vision, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ imageBase64, kind }) });
  if(!r.ok) return null; const j = await r.json(); return j.text || null;
}

// ===== Fill quick-add form =====
function fillQuickAddForm(fields){
  const v = id => document.getElementById(id);
  if(fields.date)   v('qa-date').value   = fields.date;
  if(fields.side)   v('qa-side').value   = fields.side;
  if(fields.symbol) v('qa-symbol').value = fields.symbol;
  if(Number.isFinite(fields.qty))   v('qa-qty').value   = fields.qty;
  if(Number.isFinite(fields.price)) v('qa-price').value = fields.price;
  if(Number.isFinite(fields.fee))   v('qa-fee').value   = fields.fee;
  v('qa-note').value = (fields.note || 'OCR') + (fields.total ? ` | total=${fields.total}` : '');
}

// ===== Parse detail page (en+th tolerant) to fields =====
function parseDetailToFields(text){
  const T = text.replace(/\t/g,' ').split('\n').map(s=>s.trim()).filter(Boolean).join('\n');

  // Side + Symbol
  let side = null, symbol = null;
  let mHead = T.match(/^(BUY|SELL)\s+([A-Z0-9\.]+)/mi);
  if(mHead){ side=mHead[1]; symbol=mHead[2]; }
  if(!mHead){
    const th = T.match(/^(ซื้อ|ขาย)\s+([A-Z0-9\.]+)/mi);
    if(th){ side = th[1]==='ซื้อ'?'BUY':'SELL'; symbol = th[2]; }
  }

  // Numbers
  const getNum = (re) => { const m = T.match(re); return m? parseFloat(m[1].replace(/,/g,'')) : null; };

  const price = getNum(/(ราคาที่ได้จริง|Actual\s*price|Price\s*(got|received))\s*[: ]\s*([0-9.,]+)/i);
  const qty   = getNum(/(จำนวนหุ้น|Shares?|Quantity)\s*[: ]\s*([0-9.,]+)/i) || getNum(/([0-9.,]+)\s*(หุ้น|shares?)/i);
  let feeTotal=0;
  const fee1  = getNum(/(Commission|ค่าคอมมิช(ช|ซ)ัน)\s*[: ]\s*(-?[0-9.,]+)/i) || 0;
  const fee2  = getNum(/TAF\s*Fee\s*[: ]\s*(-?[0-9.,]+)/i) || 0;
  const fee3  = getNum(/VAT\s*[: ]\s*(-?[0-9.,]+)/i) || 0;
  feeTotal = (fee1||0)+(fee2||0)+(fee3||0);

  const total = getNum(/(Amount\s*(to\s*pay|due)|Amount\s*(to\s*receive))\s*[: ]\s*([0-9.,]+)/i) 
             || getNum(/ยอดที่(ต้องชำระ|จะได้รับคืน)\s*([0-9.,]+)/i);

  // Date
  let date = null;
  const md = T.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(:\d{2})?)/);
  if(md) date = `${md[1]} ${md[2].slice(0,8)}`;
  if(!date){
    const dt = T.match(/(\d{1,2}\s+[ก-๙\.]+\s+(256\d|\d{2}).*?\d{2}:\d{2}(:\d{2})?)/);
    if(dt) date = parseThaiDate(dt[1]);
  }

  return { side, symbol, qty, price, fee:feeTotal||0, total, date, note:'OCR' };
}

// ===== Market data =====
async function fetchQuote(symbol){
  const key = (getCfg().finnhub||'').trim(); if(!key) return null;
  const url=`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`;
  try{ const r=await fetch(url); if(!r.ok) return null; return await r.json(); }catch{return null}
}

async function fetchDividends(symbol){
  const key = (getCfg().finnhub||'').trim(); if(!key) return null;
  const today = new Date(); const twoYearsAgo = new Date(today.getTime()-365*2*86400000);
  const fmt=d=>d.toISOString().slice(0,10);
  const url=`https://finnhub.io/api/v1/stock/dividend?symbol=${encodeURIComponent(symbol)}&from=${fmt(twoYearsAgo)}&to=${fmt(today)}&token=${key}`;
  try{ const r=await fetch(url); if(!r.ok) return null; const j=await r.json(); return Array.isArray(j)?j:null; }catch{return null}
}
function inferDividendFreq(divs){
  if(!divs||divs.length<2) return null;
  const dates = divs.map(d=> new Date(d.exDate||d.paymentDate||d.payDate||d.date||d.recordDate||Date.parse(''))).filter(x=>!isNaN(+x)).sort((a,b)=>a-b);
  if(dates.length<2) return null;
  let gaps=[]; for(let i=1;i<dates.length;i++){ gaps.push((dates[i]-dates[i-1])/86400000); }
  const avg = gaps.reduce((a,b)=>a+b,0)/gaps.length;
  if(avg<60) return 'รายไตรมาส (คาด)';
  if(avg<120) return 'รายครึ่งปี (คาด)';
  return 'รายปี (คาด)';
}

// ===== Advice helpers =====
function slope5(c){ if(!c) return 0; const arr=c.c||[]; const last=arr.slice(-5); if(last.length<2) return 0; return (last[last.length-1]-last[0])/last[0]*100; }
async function fetchCandles(symbol){
  const key=(getCfg().finnhub||'').trim(); if(!key) return null;
  try{ const now=Math.floor(Date.now()/1000), from=now-86400*8;
    const url=`https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${now}&token=${key}`;
    const r=await fetch(url); if(!r.ok) return null; const j=await r.json(); if(j.s!=='ok') return null; return j;
  }catch{return null}
}
async function fetchEarningsUpcoming(symbol, days){
  const key=(getCfg().finnhub||'').trim(); if(!key) return null;
  try{
    const d0=new Date(), d1=new Date(Date.now()+days*86400000);
    const fmt=d=>d.toISOString().slice(0,10);
    const url=`https://finnhub.io/api/v1/calendar/earnings?from=${fmt(d0)}&to=${fmt(d1)}&symbol=${encodeURIComponent(symbol)}&token=${key}`;
    const r=await fetch(url); if(!r.ok) return null; const j=await r.json();
    const arr=j.earningsCalendar||j.result||[]; return arr&&arr.length?arr[0]:null;
  }catch{return null}
}

function advise({tp,sl,earnDays}, pos, isDividendStock){
  if(isDividendStock) return { decision:'ถือรับปันผล', tags:[{k:'หุ้นปันผล',t:'t-amber'}], reason:'เน้นรับปันผล' };
  const gainPct = pos.avg? ((pos.cur-pos.avg)/pos.avg*100) : 0;
  const tags=[]; const reason=[];
  if(pos.earnSoon) tags.push({k:'งบใกล้ออก',t:'t-amber'}), reason.push(`งบใน ≤${earnDays} วัน`);
  if(gainPct>=tp) tags.push({k:`กำไร ≥ ${tp}%`,t:'t-green'});
  if(gainPct<=sl) tags.push({k:`ขาดทุน ≤ ${sl}%`,t:'t-red'});
  if(pos.momo>=0.5) tags.push({k:`ขาขึ้น ${pos.momo.toFixed(1)}%/5วัน`,t:'t-green'});
  if(pos.momo<=-0.5) tags.push({k:`ขาลง ${pos.momo.toFixed(1)}%/5วัน`,t:'t-red'});
  let decision='ถือรอต่อ';
  if(gainPct>=tp && pos.momo<=0){ decision='ควรขาย'; reason.push('กำไรถึงเป้า + โมเมนตัมลบ/แผ่ว'); }
  else if(pos.earnSoon && gainPct>0){ decision='พิจารณาขายบางส่วน'; reason.push('ใกล้งบและมีกำไร'); }
  else if(gainPct<=sl){ decision='พิจารณาตัดขาดทุน'; reason.push('ถึงจุด SL'); }
  else if(pos.momo>0){ decision='ถืออีก 3–5 วัน'; reason.push('แนวโน้มบวก'); }
  else { decision='ถือรอดู 1–2 วัน'; reason.push('ยังไม่ชัด'); }
  return { decision, tags, reason:reason.join(' · '), gainPct };
}

// ===== Portfolio render =====
async function renderPortfolio(){
  const tp=parseFloat(document.getElementById('tp').value||'5');
  const sl=parseFloat(document.getElementById('sl').value||'-10');
  const earnDays=parseInt(document.getElementById('earnDays').value||'3',10);

  const rows=getTrades();
  const by={}; rows.forEach(r=>{ if(r.sym && r.sym!=='CASH'){ (by[r.sym]=by[r.sym]||[]).push(r);} });
  const syms=Object.keys(by);
  const box=document.getElementById('portfolio');
  if(!syms.length){ box.innerHTML=`<div class='text-sm muted'>ยังไม่มีรายการ — อัปโหลดรูปแล้วกดบันทึกจากฟอร์มด้านบน</div>`; return; }

  const quotes={}, candles={}, earnings={}, divsMap={};
  await Promise.all(syms.map(async s=>{
    quotes[s]=await fetchQuote(s);
    candles[s]=await fetchCandles(s);
    earnings[s]=await fetchEarningsUpcoming(s, earnDays);
    divsMap[s]=await fetchDividends(s);
  }));

  let items = syms.map(s=>{
    let qty=0,cost=0,fees=0, hasDiv=false;
    by[s].forEach(r=>{
      if(r.side==='BUY'){ qty+=r.qty; cost+=r.qty*r.price; fees+=r.fee||0; }
      else if(r.side==='SELL'){ qty-=r.qty; cost-=r.qty*(cost/Math.max(qty+r.qty,1)); fees+=r.fee||0; }
      else if(r.side==='FEE'){ fees+=r.fee||0; }
      else if(r.side==='DIV'){ hasDiv=true; }
    });
    const avg=qty? cost/qty:0; const cur=quotes[s]?.c||0;
    const momo=slope5(candles[s]); const earnSoon=!!earnings[s];
    const mkt=qty*cur, pnl=qty*(cur-avg)-fees, pnlPct=avg? (cur-avg)/avg*100:0;
    const inferredFreq = inferDividendFreq(divsMap[s]);
    const hasDividendHistory = (divsMap[s]&&divsMap[s].length>0);
    const adv=advise({tp,sl,earnDays},{avg,cur,qty,earnSoon,momo}, hasDiv||hasDividendHistory);
    return { s, qty, avg, cur, mkt, fees, pnl, pnlPct, adv, count:by[s].length, earn:earnings[s], dividend: hasDiv||hasDividendHistory, freq: inferredFreq };
  });

  items.sort((a,b)=> (b.adv.tags.some(t=>t.k==='งบใกล้ออก') - a.adv.tags.some(t=>t.k==='งบใกล้ออก')) || b.mkt-a.mkt );

  box.innerHTML = items.map(x=>{
    const pnlCls = x.pnl>=0?'color:var(--green)':'color:var(--red)';
    const tagHtml = x.adv.tags.map(t=>`<span class="tag ${t.t}">${t.k}</span>`).join(' ');
    const earnTxt = x.earn? `<div class="text-xs muted">งบ: ${x.earn.date||x.earn.EPSReportDate||''}</div>`:'';
    const divTxt = x.dividend? `<span class="tag t-amber">หุ้นปันผล${x.freq?(' · '+x.freq):''}</span>`:'';
    return `<div class="p-4 card">
      <div class="flex items-center justify-between">
        <div class="font-semibold text-[15px]">${x.s} ${divTxt}</div>
        <div class="text-[11px] muted">${x.count} รายการ</div>
      </div>
      <div class="mt-2 flex flex-wrap gap-2">${tagHtml}</div>
      ${earnTxt}
      <div class="mt-2 grid grid-cols-2 gap-2 text-[13px]">
        <div class="pill">จำนวนคงเหลือ: <b>${x.qty.toFixed(6)}</b></div>
        <div class="pill">มูลค่าปัจจุบัน: <b>${toUSD(x.mkt)}</b></div>
        <div class="pill">ราคาเฉลี่ยซื้อ: <b>${toUSD(x.avg)}</b> · ปัจจุบัน: <b>${toUSD(x.cur)}</b></div>
        <div class="pill" style="${pnlCls}">กำไร: <b>${toUSD(x.pnl)}</b> (${x.pnlPct.toFixed(2)}%)</div>
      </div>
      <div class="mt-2 text-sm"><b>คำแนะนำ:</b> ${x.adv.decision} — <span class="muted">${x.adv.reason||''}</span></div>
    </div>`;
  }).join('');

  renderDividendSummary(rows);
}

// ===== Dividend summary =====
function renderDividendSummary(rows){
  const divs = rows.filter(r=>r.side==='DIV');
  const ctx = document.getElementById('divChart').getContext('2d');
  if(!divs.length){
    document.getElementById('divSummary').innerHTML='<span class="muted text-sm">ยังไม่มีรายการปันผล</span>';
    if(window._divChart) window._divChart.destroy();
    window._divChart = new Chart(ctx,{type:'bar',data:{labels:[],datasets:[{label:'Dividend (USD)',data:[]}]},options:{plugins:{legend:{display:false}}}});
    return;
  }
  const byMonth = {};
  divs.forEach(r=>{ const m=(r.d||'').slice(0,7)||new Date().toISOString().slice(0,7); byMonth[m]=(byMonth[m]||0)+(r.price||0); });
  const months = Object.keys(byMonth).sort();
  const totalYear = divs.reduce((a,b)=>a+(b.price||0),0);
  document.getElementById('divSummary').innerHTML = `รวมทั้งปี: <b>${toUSD(totalYear)}</b>`;
  if(window._divChart) window._divChart.destroy();
  window._divChart = new Chart(ctx,{type:'bar',data:{labels:months,datasets:[{label:'Dividend (USD)',data:months.map(m=>byMonth[m])}]},options:{plugins:{legend:{display:false}}}});
}

// ===== OCR flow =====
async function handleOCRtoForm(file, kind='detail'){
  const status=document.getElementById('ocrStatus'); status.textContent='กำลังส่งไป OCR...';
  let text=null;
  try{ text = await visionOCR(file, kind); }catch(e){ console.warn('Vision error', e); }
  if(!text){
    status.textContent='ใช้ Vision ไม่ได้/ไม่ได้ตั้งค่า กำลังใช้ Tesseract บนอุปกรณ์...';
    try{ text = await tesseractOCR(file); }catch(e){ status.textContent='เกิดข้อผิดพลาด OCR'; return; }
  }
  const raw=document.getElementById('raw'); if(raw) raw.textContent = text.slice(0, 2000);
  const fields = parseDetailToFields(text);
  fillQuickAddForm(fields);
  status.textContent='เติมค่าลงฟอร์มแล้ว ตรวจสอบ/แก้ไขได้ก่อนกดบันทึก';
}

// ===== Save & validate =====
function readForm(){
  const get = id => document.getElementById(id).value;
  const side = get('qa-side').toUpperCase();
  const rec = {
    d: get('qa-date') || new Date().toISOString().slice(0,10),
    sym: get('qa-symbol').toUpperCase(),
    side,
    qty: parseFloat(get('qa-qty')||'0')||0,
    price: parseFloat(get('qa-price')||'0')||0,
    fee: parseFloat(get('qa-fee')||'0')||0,
    fx: 0,
    note: get('qa-note')||'',
    ts: Date.now()
  };
  return rec;
}

function validateRec(r){
  const errs=[];
  if(!/^\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2}(:\d{2})?)?$/.test(r.d)) errs.push('รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD HH:mm:ss)');
  if(!/^[A-Z0-9\.]{1,10}$/.test(r.sym)) errs.push('สัญลักษณ์ต้องเป็น A–Z/0–9/.(ยาว ≤10)');
  if((r.side==='BUY'||r.side==='SELL') && (!r.qty || !r.price)) errs.push('BUY/SELL ต้องมีจำนวนหุ้นและราคา > 0');
  if(Math.abs(r.fee)>10000) errs.push('ค่าธรรมเนียมผิดปกติ');
  return errs;
}

function saveForm(){
  const r = readForm();
  const errs = validateRec(r);
  const errBox = document.getElementById('formErr');
  if(errs.length){ errBox.textContent = '• ' + errs.join('\n• '); return; }
  errBox.textContent='';
  const arr=getTrades(); arr.push(r); setTrades(arr);
  renderPortfolio();
  alert('บันทึกแล้ว ✅');
}
function clearForm(){ ['qa-date','qa-side','qa-symbol','qa-qty','qa-price','qa-fee','qa-note'].forEach(id=>document.getElementById(id).value=''); }

// ===== Bind UI =====
document.getElementById('fileList').addEventListener('change',e=>{const f=e.target.files?.[0]; if(f) handleOCRtoForm(f,'list');});
document.getElementById('fileDetail').addEventListener('change',e=>{const f=e.target.files?.[0]; if(f) handleOCRtoForm(f,'detail');});
document.getElementById('btnSave').addEventListener('click', saveForm);
document.getElementById('btnClear').addEventListener('click', clearForm);
document.getElementById('btnRefresh').addEventListener('click', renderPortfolio);
document.getElementById('btnEnableNotify').addEventListener('click', async()=>{
  try{ const p=await Notification.requestPermission(); alert(p==='granted'?'เปิดแจ้งเตือนแล้ว ✅':'ยังไม่ได้อนุญาต'); }catch{ alert('อุปกรณ์นี้ไม่รองรับ Notification'); }
});
document.getElementById('tp').addEventListener('change', renderPortfolio);
document.getElementById('sl').addEventListener('change', renderPortfolio);
document.getElementById('earnDays').addEventListener('change', renderPortfolio);

// Init
renderPortfolio();
