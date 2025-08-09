// Advisor with OCR-only input, alerts, dividend labeling & summary
const LS_TRADES = 'dm_adv_trades';
const apiKey = window.FINNHUB_API_KEY;

// storage
function getTrades(){ try{return JSON.parse(localStorage.getItem(LS_TRADES))||[]}catch{return[]} }
function setTrades(v){ localStorage.setItem(LS_TRADES, JSON.stringify(v)); }

// helpers
const TH_MONTH = { "ม.ค.":1,"ก.พ.":2,"มี.ค.":3,"เม.ย.":4,"พ.ค.":5,"มิ.ย.":6,"ก.ค.":7,"ส.ค.":8,"ก.ย.":9,"ต.ค.":10,"พ.ย.":11,"ธ.ค.":12 };
function beToCE(y){ const n=parseInt(y,10); return n>2400? n-543 : 2000+(n%100); }
function parseThaiDate(s){
  const m = s.match(/(\d{1,2})\s+([ก-힣\.]+)\s+(256\d|\d{2}).*?(\d{2}):(\d{2})(?::(\d{2}))?/);
  if(!m) return null;
  const d = String(parseInt(m[1],10)).padStart(2,'0');
  const mon = String(TH_MONTH[m[2]]||1).padStart(2,'0');
  const yyyy = String(beToCE(m[3]));
  const hh = m[4], mm = m[5], ss = m[6]||'00';
  return `${yyyy}-${mon}-${d} ${hh}:${mm}:${ss}`;
}
function toUSD(n){ return Number.isFinite(n) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n) : '-'; }

async function preprocess(file){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=>{
      const c = document.createElement('canvas'); c.width=img.width; c.height=img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img,0,0);
      const id = ctx.getImageData(0,0,c.width,c.height), data=id.data;
      for(let i=0;i<data.length;i+=4){
        const g = data[i]*.299 + data[i+1]*.587 + data[i+2]*.114;
        const v = Math.max(0,Math.min(255,1.35*(g-128)+128));
        data[i]=data[i+1]=data[i+2]=v;
      }
      ctx.putImageData(id,0,0);
      c.toBlob(b=>resolve(b),'image/png',1.0);
    };
    img.src = URL.createObjectURL(file);
  });
}
async function runOCR(blob){
  const worker = await Tesseract.createWorker('tha+eng');
  const { data:{ text } } = await worker.recognize(blob);
  await worker.terminate();
  return text;
}

// parsers
function parseDetail(text){
  const lines = text.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  let side=null, sym=null, qty=null, price=null, dateISO=null;
  for(let i=0;i<lines.length;i++){
    const L = lines[i];
    let m = L.match(/^(ซื้อ|ขาย)\s+([A-Z0-9\.]+)/i);
    if(m){ side = m[1]==='ซื้อ'?'BUY':'SELL'; sym = m[2].toUpperCase(); continue; }
    m = L.match(/([0-9\.,]+)\s*หุ้น/); if(m){ qty=parseFloat(m[1].replace(/,/g,'')); continue; }
    m = L.match(/ราคาที่ได้จริง\s*([0-9\.,]+)/); if(m){ price=parseFloat(m[1].replace(/,/g,'')); continue; }
    if(!dateISO && /(\d{1,2})\s+[ก-힣\.]+\s+(256\d|\d{2}).*(\d{2}):(\d{2})/.test(L)){ dateISO = parseThaiDate(L); }
  }
  if(side && sym && qty!=null && price!=null){
    return [{ d:(dateISO||new Date().toISOString().slice(0,10)), sym, side, qty, price, fee:0, fx:0, note:'OCR:DETAIL', ts:Date.now() }];
  }
  return [];
}
function parseList(text){
  const lines = text.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const out = [];
  for(let i=0;i<lines.length;i++){
    const L = lines[i];
    let m = L.match(/^(ซื้อ|ขาย)\s+([A-Z0-9\.]+)/i);
    if(m){
      const side = m[1]==='ซื้อ'?'BUY':'SELL';
      const sym = m[2].toUpperCase();
      let qty=null, price=null, dateISO=null;
      for(let j=i+1;j<Math.min(i+6,lines.length);j++){
        const lj = lines[j];
        const mq = lj.match(/จำนวนหุ้น\s*([0-9\.,]+)/i) || lj.match(/([0-9\.,]+)\s*หุ้น/);
        if(mq) qty = parseFloat(mq[1].replace(/,/g,''));
        const mp = lj.match(/ราคาที่ได้จริง\s*([0-9\.,]+)/);
        if(mp) price = parseFloat(mp[1].replace(/,/g,''));
        if(!dateISO && /\d{1,2}\s+[ก-힣\.]+\s+(256\d|\d{2}).*\d{2}:\d{2}/.test(lj)) dateISO = parseThaiDate(lj);
      }
      if(sym && qty!=null && price!=null){
        out.push({ d:(dateISO||new Date().toISOString().slice(0,10)), sym, side, qty, price, fee:0, fx:0, note:'OCR:LIST', ts:Date.now() });
      }
      continue;
    }
    // Dividend
    m = L.match(/^ปันผล\s+([A-Z0-9\.]+)/i);
    if(m){
      const sym = m[1].toUpperCase(); let amount=null, dateISO=null;
      for(let j=i+1;j<Math.min(i+6,lines.length);j++){
        const lj = lines[j];
        const ma = lj.match(/([0-9\.,]+)\s*USD/); if(ma) amount=parseFloat(ma[1].replace(/,/g,''));
        if(!dateISO && /\d{1,2}\s+[ก-힣\.]+\s+(256\d|\d{2}).*\d{2}:\d{2}/.test(lj)) dateISO = parseThaiDate(lj);
      }
      if(amount!=null){ out.push({ d:(dateISO||new Date().toISOString().slice(0,10)), sym, side:'DIV', qty:0, price:amount, fee:0, fx:0, note:'DIV OCR', ts:Date.now() }); }
      continue;
    }
    // Fee/Tax
    if(/ค่าธรรมเนียม|TAF Fee/i.test(L)){
      let amount=null, dateISO=null;
      for(let j=i+1;j<Math.min(i+4,lines.length);j++){
        const lj = lines[j];
        const ma = lj.match(/-?([0-9\.,]+)\s*USD/); if(ma) amount=parseFloat(ma[1].replace(/,/g,''));
        if(!dateISO && /\d{1,2}\s+[ก-힣\.]+\s+(256\d|\d{2}).*\d{2}:\d{2}/.test(lj)) dateISO = parseThaiDate(lj);
      }
      if(amount!=null){ out.push({ d:(dateISO||new Date().toISOString().slice(0,10)), sym:'CASH', side:'FEE', qty:0, price:0, fee:amount, fx:0, note:'FEE OCR', ts:Date.now() }); }
      continue;
    }
  }
  return out;
}

// market data
async function fetchQuote(symbol){
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const res = await fetch(url); if(!res.ok) throw new Error('quote fail'); return res.json();
}
async function fetchCandles(symbol){
  try{
    const now = Math.floor(Date.now()/1000), from = now - 86400*8;
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${now}&token=${apiKey}`;
    const r = await fetch(url); if(!r.ok) return null; const d = await r.json(); if(d.s!=='ok') return null; return d;
  }catch{return null}
}
async function fetchEarningsUpcoming(symbol, days){
  try{
    const d0 = new Date(); const d1 = new Date(Date.now()+days*86400000);
    const fmt = d=>d.toISOString().slice(0,10);
    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${fmt(d0)}&to=${fmt(d1)}&symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const r = await fetch(url); if(!r.ok) return null; const j = await r.json();
    const arr = j.earningsCalendar || j.result || [];
    return arr && arr.length ? arr[0] : null;
  }catch{return null}
}
function slope5(candles){
  if(!candles) return 0;
  const arr = candles.c || []; if(arr.length<2) return 0;
  const last = arr.slice(-5); if(last.length<2) return 0;
  return (last[last.length-1]-last[0])/last[0]*100;
}

// advice
function advise({tp, sl, earnDays, isDividend}, pos){
  if(isDividend){
    return { decision:'ถือรับปันผล', tags:[{k:'หุ้นปันผล', t:'tag-cyan'}], reason:'มีประวัติรับปันผลจาก OCR', gainPct: pos.avg?((pos.cur-pos.avg)/pos.avg*100):0 };
  }
  const gainPct = pos.avg? ((pos.cur-pos.avg)/pos.avg*100) : 0;
  const tags=[]; const reason=[];
  if(pos.earnSoon){ tags.push({k:'งบใกล้ออก', t:'tag-amber'}); reason.push(`งบใน ${earnDays} วัน`); }
  if(gainPct >= tp){ tags.push({k:`กำไร ≥ ${tp}%`, t:'tag-green'}); }
  if(gainPct <= sl){ tags.push({k:`ขาดทุน ≤ ${sl}%`, t:'tag-red'}); }
  if(pos.momo >= 0.5){ tags.push({k:`ขาขึ้น ${pos.momo.toFixed(1)}%/5วัน`, t:'tag-green'}); }
  if(pos.momo <= -0.5){ tags.push({k:`ขาลง ${pos.momo.toFixed(1)}%/5วัน`, t:'tag-red'}); }

  let decision='ถือรอต่อ';
  if(gainPct >= tp && pos.momo <= 0){ decision='ควรขาย'; reason.push('กำไรถึงเป้า + โมเมนตัมลบ/แผ่ว'); }
  else if(pos.earnSoon && gainPct > 0){ decision='พิจารณาขายบางส่วน'; reason.push('ใกล้งบและมีกำไร'); }
  else if(gainPct <= sl){ decision='พิจารณาตัดขาดทุน'; reason.push('ถึงจุด SL'); }
  else if(pos.momo > 0){ decision='ถืออีก 3–5 วัน'; reason.push('แนวโน้มบวก'); }
  else { decision='ถือรอดู 1–2 วัน'; reason.push('ยังไม่ชัด'); }

  return { decision, tags, reason: reason.join(' · '), gainPct };
}

// portfolio & div summary
async function renderAll(){
  const tp = parseFloat(document.getElementById('tp').value||'5');
  const sl = parseFloat(document.getElementById('sl').value||'-10');
  const earnDays = parseInt(document.getElementById('earnDays').value||'3',10);

  const rows = getTrades();
  // dividend summary
  const divByMonth = {}; let divYear=0;
  rows.filter(r=>r.side==='DIV').forEach(r=>{
    const d = (r.d||'').slice(0,10);
    const y = d.slice(0,4), m = d.slice(5,7);
    const key = `${y}-${m}`;
    divByMonth[key] = (divByMonth[key]||0) + (r.price||0);
    divYear += (r.price||0);
  });
  const sumBox = document.getElementById('divSummary');
  const months = Object.keys(divByMonth).sort();
  sumBox.innerHTML = months.length? 
    `<div class='grid grid-cols-2 gap-2'>${months.map(k=>`<div class='pill flex justify-between'><span>${k}</span><b>${toUSD(divByMonth[k])}</b></div>`).join('')}</div>
     <div class='mt-2'>รวมปีนี้: <b>${toUSD(divYear)}</b></div>`
    : `<div class='text-sm muted'>ยังไม่มีรายการปันผล</div>`;

  const by = {}; rows.forEach(r=>{ if(r.sym && r.sym!=='CASH'){ (by[r.sym]=by[r.sym]||[]).push(r); } });
  const syms = Object.keys(by);
  const box = document.getElementById('portfolio');
  if(!syms.length){ box.innerHTML = `<div class='text-sm muted'>ยังไม่มีรายการจาก OCR — อัปโหลดรูปจาก Dime ก่อน</div>`; return; }

  const quotes={}, candles={}, earnings={};
  await Promise.all(syms.map(async s=>{
    try{ quotes[s]=await fetchQuote(s); }catch{ quotes[s]=null; }
    candles[s]=await fetchCandles(s);
    earnings[s]=await fetchEarningsUpcoming(s, earnDays);
  }));

  let items = syms.map(s=>{
    let qty=0, cost=0, fees=0, hasDiv=false;
    by[s].forEach(r=>{
      if(r.side==='BUY'){ qty+=r.qty; cost+=r.qty*r.price; fees+=r.fee||0; }
      else if(r.side==='SELL'){ qty-=r.qty; cost-=r.qty*(cost/Math.max(qty+r.qty,1)); fees+=r.fee||0; }
      else if(r.side==='FEE'){ fees+=r.fee||0; }
      else if(r.side==='DIV'){ hasDiv=true; }
    });
    const avg = qty? cost/qty : 0;
    const cur = quotes[s]?.c || 0;
    const momo = slope5(candles[s]);
    const earnSoon = !!earnings[s];
    const mkt = qty*cur;
    const pnl = qty*(cur-avg)-fees;
    const pnlPct = avg? (cur-avg)/avg*100 : 0;

    const adv = advise({tp, sl, earnDays, isDividend: hasDiv}, {avg, cur, qty, earnSoon, momo});
    return { s, qty, avg, cur, mkt, fees, pnl, pnlPct, adv, count: by[s].length, earn: earnings[s], hasDiv };
  });

  items.sort((a,b)=> (b.adv.tags.some(t=>t.k.includes('งบใกล้ออก')) - a.adv.tags.some(t=>t.k.includes('งบใกล้ออก'))) 
                    || b.mkt - a.mkt );

  box.innerHTML = items.map(x=>{
    const tags = [...x.adv.tags];
    if(x.hasDiv && !tags.some(t=>t.k==='หุ้นปันผล')) tags.unshift({k:'หุ้นปันผล', t:'tag-cyan'});
    const tagHtml = tags.map(t=>`<span class="tag ${t.t}">${t.k}</span>`).join(' ');
    const earnTxt = x.earn ? `<div class='text-xs muted'>งบ: ${x.earn.date || x.earn.EPSReportDate || ''}</div>` : '';
    const pnlCls = x.pnl>=0 ? 'text-[var(--green)]' : 'text-[var(--red)]';
    return `<div class='p-4 card'>
      <div class='flex items-center justify-between gap-2'>
        <div class='font-semibold text-[15px]'>${x.s}</div>
        <div class='text-[11px] muted'>${x.count} รายการ</div>
      </div>
      <div class='mt-2 flex flex-wrap gap-2'>${tagHtml}</div>
      ${earnTxt}
      <div class='mt-2 grid grid-cols-2 gap-2 text-[13px]'>
        <div class='pill'>จำนวนคงเหลือ: <b>${x.qty.toFixed(6)}</b></div>
        <div class='pill'>มูลค่าปัจจุบัน: <b>${toUSD(x.mkt)}</b></div>
        <div class='pill'>ราคาเฉลี่ยซื้อ: <b>${toUSD(x.avg)}</b> · ปัจจุบัน: <b>${toUSD(x.cur)}</b></div>
        <div class='pill ${pnlCls}'>กำไร: <b>${toUSD(x.pnl)}</b> (${x.pnlPct.toFixed(2)}%)</div>
      </div>
      <div class='mt-2 text-sm'><b>คำแนะนำ:</b> ${x.adv.decision} — <span class='muted'>${x.adv.reason||''}</span></div>
    </div>`;
  }).join('');
}

// Alerts
let alertTimer=null;
async function checkAlerts(){
  const tp = parseFloat(document.getElementById('tp').value||'5');
  const sl = parseFloat(document.getElementById('sl').value||'-10');
  const rows = getTrades();
  const by = {}; rows.forEach(r=>{ if(r.sym && r.sym!=='CASH'){ (by[r.sym]=by[r.sym]||[]).push(r); } });
  const syms = Object.keys(by);
  for(const s of syms){
    let qty=0, cost=0;
    by[s].forEach(r=>{
      if(r.side==='BUY'){ qty+=r.qty; cost+=r.qty*r.price; }
      else if(r.side==='SELL'){ qty-=r.qty; cost-=r.qty*(cost/Math.max(qty+r.qty,1)); }
    });
    const avg = qty? cost/qty : 0;
    try{
      const q = await fetchQuote(s);
      const cur = q?.c || 0;
      const gainPct = avg? (cur-avg)/avg*100 : 0;
      if(gainPct >= tp){
        new Notification(`🎯 ถึงเป้ากำไร ${tp}%`, { body:`${s} กำไร ~${gainPct.toFixed(1)}%` });
      } else if(gainPct <= sl){
        new Notification(`⚠️ ถึงจุดขาดทุน ${sl}%`, { body:`${s} ขาดทุน ~${gainPct.toFixed(1)}%` });
      }
    }catch{}
  }
}
function startAlerts(){
  if(alertTimer) clearInterval(alertTimer);
  alertTimer = setInterval(checkAlerts, 60_000);
}

// Bind UI
document.getElementById('fileList').addEventListener('change', async (e)=>{
  const f=e.target.files?.[0]; if(!f) return;
  const status = document.getElementById('ocrStatus'); status.textContent='กำลังอ่านภาพ (รายการรวม)...';
  const blob = await preprocess(f); const text = await runOCR(blob||f);
  document.getElementById('raw').textContent = text.slice(0,2000);
  const rows = parseList(text);
  if(!rows.length){ status.textContent='อ่านไม่สำเร็จ — ซูมให้ใหญ่ขึ้น/แคปชัด ๆ แล้วลองใหม่'; return; }
  const arr = getTrades(); rows.forEach(r=>arr.push(r)); setTrades(arr);
  status.textContent = `เพิ่มรายการแล้ว ${rows.length} รายการ (หน้ารายการรวม)`;
  renderAll();
});
document.getElementById('fileDetail').addEventListener('change', async (e)=>{
  const f=e.target.files?.[0]; if(!f) return;
  const status = document.getElementById('ocrStatus'); status.textContent='กำลังอ่านภาพ (รายละเอียดคำสั่ง)...';
  const blob = await preprocess(f); const text = await runOCR(blob||f);
  document.getElementById('raw').textContent = text.slice(0,2000);
  const rows = parseDetail(text);
  if(!rows.length){ status.textContent='อ่านไม่สำเร็จ — ซูมให้ใหญ่ขึ้น/แคปชัด ๆ แล้วลองใหม่'; return; }
  const arr = getTrades(); rows.forEach(r=>arr.push(r)); setTrades(arr);
  status.textContent = `เพิ่มรายการแล้ว ${rows.length} รายการ (หน้ารายละเอียด)`;
  renderAll();
});
document.getElementById('btnRefresh').addEventListener('click', renderAll);
['tp','sl','earnDays'].forEach(id=>document.getElementById(id).addEventListener('change', renderAll));

document.getElementById('btnNotif').addEventListener('click', async ()=>{
  if(Notification && Notification.permission !== 'granted'){
    await Notification.requestPermission();
  }
  if(Notification.permission==='granted'){
    startAlerts();
    new Notification('🔔 เปิดการแจ้งเตือนแล้ว', { body:'ระบบจะเช็คราคา/กำไรทุก 1 นาที' });
  }else{
    alert('ไม่สามารถเปิดการแจ้งเตือน: เบราว์เซอร์ไม่อนุญาต');
  }
});

// Init
renderAll();
