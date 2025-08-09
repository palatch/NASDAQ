// Advisor build: OCR + earnings calendar + recommendations
const LS_KEYS = { TRADES:'dm_bk_trades', SETTINGS:'dm_bk_settings' };
const apiKey = window.FINNHUB_API_KEY;

function getTrades(){ try{ return JSON.parse(localStorage.getItem(LS_KEYS.TRADES))||[]; } catch{ return []; } }
function setTrades(v){ localStorage.setItem(LS_KEYS.TRADES, JSON.stringify(v)); }
function getSettings(){
  try{ return JSON.parse(localStorage.getItem(LS_KEYS.SETTINGS))||{tp:5, sl:10, earnDays:3}; }
  catch{ return {tp:5, sl:10, earnDays:3}; }
}
function setSettings(s){ localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(s)); }

async function fetchQuote(symbol){
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const res = await fetch(url); if(!res.ok) throw new Error('quote failed'); return res.json();
}
async function fetchCandles(symbol){
  try{
    const now = Math.floor(Date.now()/1000), from = now - 86400*7;
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${now}&token=${apiKey}`;
    const r = await fetch(url); if(!r.ok) throw new Error('candle');
    const d = await r.json(); if(d.s!=='ok') throw new Error('no');
    return d;
  }catch(e){ return null; }
}
// Pull earnings calendar for the next 21 days then filter
async function fetchUpcomingEarnings(symbols, days){
  const from = new Date().toISOString().slice(0,10);
  const to = new Date(Date.now()+days*86400000).toISOString().slice(0,10);
  const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${apiKey}`;
  const r = await fetch(url); if(!r.ok) return {};
  const d = await r.json();
  const list = d.earningsCalendar || [];
  const set = new Set(symbols.map(s=>s.toUpperCase()));
  const out = {};
  list.forEach(it=>{
    const sym = (it.symbol||it.SYMBOL||'').toUpperCase();
    if(set.has(sym)) out[sym] = it.date || it.DATE || it['earningsDate'];
  });
  return out;
}

const fUSD = (n)=> Number.isFinite(n)? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n):'-';

function addTrade(){
  const d = document.getElementById('tradeDate').value || new Date().toISOString().slice(0,10);
  const sym = (document.getElementById('tradeSymbol').value||'').trim().toUpperCase();
  const side = document.getElementById('tradeSide').value;
  const qty = parseFloat(document.getElementById('tradeQty').value||'0');
  const price = parseFloat(document.getElementById('tradePrice').value||'0');
  const fee = parseFloat(document.getElementById('tradeFee').value||'0');
  const note = document.getElementById('tradeNote').value||'';
  if(!sym || (!qty && (side==='BUY'||side==='SELL'))) { alert('กรอก Symbol / จำนวน ให้ครบ'); return; }
  const arr = getTrades(); arr.push({d,sym,side,qty,price,fee,note,ts:Date.now()}); setTrades(arr);
  ['tradeQty','tradePrice','tradeFee','tradeNote','tradeSymbol'].forEach(id=>document.getElementById(id).value='');
  renderPortfolio();
}

function exportCsv(){
  const rows = getTrades();
  const header = ['date','symbol','side','qty','price_usd','fee_usd','note'];
  const lines = [header.join(',')].concat(rows.map(r=>[r.d,r.sym,r.side,r.qty,r.price,r.fee,'"'+(r.note||'').replace(/"/g,'""')+'"'].join(',')));
  const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='trades.csv'; a.click(); URL.revokeObjectURL(url);
}
function clearAll(){ if(!confirm('ล้างข้อมูลทั้งหมดในเครื่องนี้?')) return; localStorage.removeItem(LS_KEYS.TRADES); renderPortfolio(); }

function saveSettingsUI(){
  const s = { tp:parseFloat(document.getElementById('setTP').value||'5'), sl:parseFloat(document.getElementById('setSL').value||'10'), earnDays:parseInt(document.getElementById('setE').value||'3') };
  setSettings(s); renderPortfolio();
}

document.getElementById('setTP').addEventListener('input', saveSettingsUI);
document.getElementById('setSL').addEventListener('input', saveSettingsUI);
document.getElementById('setE').addEventListener('input', saveSettingsUI);

// ---- OCR (simplified; preprocessing by drawing to canvas for contrast) ----
const TH_MONTH = { "ม.ค.":1,"ก.พ.":2,"มี.ค.":3,"เม.ย.":4,"พ.ค.":5,"มิ.ย.":6,"ก.ค.":7,"ส.ค.":8,"ก.ย.":9,"ต.ค.":10,"พ.ย.":11,"ธ.ค.":12 };
function beToCE(twoDigit){ return (2500 + parseInt(twoDigit||'0',10)) - 543; }
function parseThaiDate(s){
  const m = s.match(/(\d{1,2})\s+([ก-힣\.]+)\s+(\d{2}).*?(\d{2}):(\d{2}):(\d{2})/);
  if(!m) return null;
  const d = parseInt(m[1],10), mon = TH_MONTH[m[2]]||1, y = beToCE(m[3]);
  const hh = m[4], mm = m[5], ss = m[6];
  return `${y}-${String(mon).padStart(2,'0')}-${String(d).padStart(2,'0')} ${hh}:${mm}:${ss}`;
}
async function handleOCRFile(file){
  const status = document.getElementById('ocrStatus');
  status.textContent = 'กำลังปรับภาพ + อ่าน OCR...';
  // preprocess to canvas (increase contrast)
  const img = new Image();
  const reader = new FileReader();
  const url = await new Promise(res=>{ reader.onload=()=>res(reader.result); reader.readAsDataURL(file); });
  img.src = url; await new Promise(r=>{ img.onload=r; });
  const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0);
  const data = ctx.getImageData(0,0,canvas.width,canvas.height);
  // simple contrast/threshold
  for(let i=0;i<data.data.length;i+=4){
    const g = 0.299*data.data[i]+0.587*data.data[i+1]+0.114*data.data[i+2];
    const v = g>140?255: (g<110?0: g*1.2);
    data.data[i]=data.data[i+1]=data.data[i+2]=v;
  }
  ctx.putImageData(data,0,0);

  const processedBlob = await new Promise(res=> canvas.toBlob(res, 'image/png'));
  const { createWorker } = Tesseract;
  const worker = await createWorker('tha+eng');
  const { data:{ text } } = await worker.recognize(processedBlob);
  await worker.terminate();
  status.textContent = 'กำลังวิเคราะห์ข้อความ...';

  const lines = text.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const results = [];

  for(let i=0;i<lines.length;i++){
    const L = lines[i];

    let m = L.match(/^(ซื้อ|ขาย)\s+([A-Z0-9\.]+)/i);
    if(m){
      const side = m[1]==='ซื้อ'?'BUY':'SELL';
      const sym = m[2].toUpperCase();
      let qty=0, price=0, dateStr=null;
      for(let j=i+1;j<Math.min(i+6,lines.length);j++){
        const lj = lines[j];
        const mq = lj.match(/([0-9\.\,]+)\s*หุ้น/);
        if(mq) qty = parseFloat(mq[1].replace(/,/g,''));
        const mp = lj.match(/ราคาที่ได้จริง\s*([0-9\.\,]+)/);
        if(mp) price = parseFloat(mp[1].replace(/,/g,''));
        if(!dateStr && /\d{1,2}\s+[ก-힣\.]+\s+\d{2}.*\d{2}:\d{2}:\d{2}/.test(lj)) dateStr = parseThaiDate(lj);
      }
      if(sym && qty && price){
        results.push({ d: (dateStr||'').slice(0,10) || new Date().toISOString().slice(0,10), sym, side, qty, price, fee:0, note:'OCR' });
      }
      continue;
    }

    m = L.match(/^ปันผล\s+([A-Z0-9\.]+)/i);
    if(m){
      const sym = m[1].toUpperCase(); let amount=0, dateStr=null;
      for(let j=i+1;j<Math.min(i+6,lines.length);j++){
        const lj = lines[j];
        const ma = lj.match(/([0-9\.\,]+)\s*(USD|บาท)/i);
        if(ma) amount = parseFloat(ma[1].replace(/,/g,''));
        if(!dateStr && /\d{1,2}\s+[ก-힣\.]+\s+\d{2}.*\d{2}:\d{2}:\d{2}/.test(lj)) dateStr = parseThaiDate(lj);
      }
      results.push({ d: (dateStr||'').slice(0,10) || new Date().toISOString().slice(0,10), sym, side:'DIV', qty:0, price:amount, fee:0, note:'DIV OCR' });
      continue;
    }

    if(/ค่าธรรมเนียม|TAF Fee/i.test(L)){
      let amount=0, dateStr=null;
      for(let j=i+1;j<Math.min(i+4,lines.length);j++){
        const lj = lines[j];
        const ma = lj.match(/-?([0-9\.\,]+)\s*(USD|บาท)/i);
        if(ma) amount = parseFloat(ma[1].replace(/,/g,''));
        if(!dateStr && /\d{1,2}\s+[ก-힣\.]+\s+\d{2}.*\d{2}:\d{2}:\d{2}/.test(lj)) dateStr = parseThaiDate(lj);
      }
      results.push({ d: (dateStr||'').slice(0,10) || new Date().toISOString().slice(0,10), sym:'CASH', side:'FEE', qty:0, price:0, fee:amount, note:'FEE OCR' });
      continue;
    }
  }

  if(results.length===0){ status.textContent = 'อ่านภาพเสร็จแต่ยังจับรายการไม่ได้ ลองซูมหรือส่งรูปที่คมชัดขึ้น'; return; }
  const arr = getTrades(); results.forEach(r=>arr.push(r)); setTrades(arr);
  status.textContent = `เพิ่มจาก OCR แล้ว ${results.length} รายการ`;
  renderPortfolio();
}

// ---- Recommendations ----
function buildAdvice(item, earningsDate, settings, momentumSlope){
  const { tp, sl, earnDays } = settings;
  const now = new Date();
  let daysToEarnings = null;
  if(earningsDate){
    const d = new Date(earningsDate);
    daysToEarnings = Math.ceil((d - now)/86400000);
  }
  const tags = [];
  if(daysToEarnings!==null && daysToEarnings <= earnDays) tags.push(`งบใน ${daysToEarnings} วัน`);
  if(momentumSlope!==null){
    tags.push(momentumSlope>=0 ? 'โมเมนตัมบวก' : 'โมเมนตัมลบ');
  }

  let action = 'ถือ';
  let holdDays = null;

  // Profit/Loss percent
  const pnlPct = item.pnlPct;

  if(pnlPct >= tp){
    action = (daysToEarnings!==null && daysToEarnings<=earnDays && momentumSlope<0) ? 'ควรขาย' : 'พิจารณาขาย';
  }else if(pnlPct <= -sl){
    action = 'พิจารณาตัดขาดทุน';
  }else{
    if(momentumSlope>0 && (daysToEarnings===null || daysToEarnings>earnDays)){
      holdDays = Math.min(5, Math.max(2, Math.round(momentumSlope*10))); // heuristic
      action = `ถืออีก ~${holdDays} วัน`;
    }else if(daysToEarnings!==null && daysToEarnings<=earnDays){
      action = 'พิจารณาขายบางส่วน';
    }else{
      action = 'ถือ';
    }
  }

  return { action, tags };
}

async function renderPortfolio(){
  const s = getSettings();
  document.getElementById('setTP').value = s.tp;
  document.getElementById('setSL').value = s.sl;
  document.getElementById('setE').value = s.earnDays;

  const box = document.getElementById('portfolio'); const rows = getTrades();
  const by = {}; rows.forEach(r=>{ if(r.sym){ (by[r.sym]=by[r.sym]||[]).push(r); } });
  const syms = Object.keys(by);
  if(syms.length===0){ box.innerHTML = `<div class='text-sm muted'>ยังไม่มีรายการ — อัปโหลดภาพหรือกรอกด้วยฟอร์มด้านบน</div>`; return; }

  // quotes, candles, earnings in parallel
  const quotes = {}; const candles = {};
  await Promise.all(syms.map(async s=>{
    try{ quotes[s]=await fetchQuote(s); } catch{ quotes[s]=null; }
    try{ candles[s]=await fetchCandles(s); } catch{ candles[s]=null; }
  }));
  const earnMap = await fetchUpcomingEarnings(syms, 21);

  // compute per symbol
  let items = syms.map(s=>{
    const q = quotes[s]; const arr = by[s];
    let qty=0, cost=0, fees=0;
    arr.forEach(r=>{
      if(r.side==='BUY'){ qty+=r.qty; cost+=r.qty*r.price; fees+=r.fee||0; }
      else if(r.side==='SELL'){ qty-=r.qty; cost-=r.qty*(cost/Math.max(qty+r.qty,1)); fees+=r.fee||0; }
    });
    const avg = qty!==0? cost/qty : 0;
    const cur = q && q.c? q.c : 0;
    const mkt = qty*cur;
    const pnl = qty*(cur-avg)-fees;
    const pnlPct = avg!==0 ? ((cur-avg)/avg*100) : 0;
    const investedNow = qty>0 ? qty*avg : 0;
    // momentum slope (last 5 daily closes)
    let slope = null;
    const c = candles[s]; if(c && Array.isArray(c.c) && c.c.length>=5){
      const last = c.c.slice(-5);
      slope = (last[4]-last[0]) / last[0]; // relative change over 5 days
    }
    return { s, qty, avg, cur, mkt, fees, pnl, pnlPct, investedNow, count: arr.length, slope };
  });

  // sort: holding first by invested value desc
  items.sort((a,b)=> (b.investedNow>0)-(a.investedNow>0) || b.investedNow - a.investedNow || a.s.localeCompare(b.s));

  // build cards
  const cards = items.map(x=>{
    const earnDate = earnMap[x.s];
    const adv = buildAdvice(x, earnDate, s, x.slope);
    const cls = x.pnl>=0 ? 'text-[var(--green)]' : 'text-[var(--red)]';
    const earnBadge = earnDate ? `<span class='badge badge-earn'>งบ: ${earnDate}</span>` : '';
    const tagStr = adv.tags.length? adv.tags.map(t=>`<span class='badge'>${t}</span>`).join(' ') : '';
    return `<div class='p-4 card'>
      <div class='flex items-center justify-between'>
        <div class='font-semibold text-[15px]'>${x.s} ${earnBadge}</div>
        <div class='text-[11px] muted'>${x.count} รายการ</div>
      </div>
      <div class='mt-2 grid grid-cols-2 gap-2 text-[13px]'>
        <div class='pill'>จำนวนคงเหลือ: <b>${x.qty.toFixed(6)}</b></div>
        <div class='pill'>มูลค่าปัจจุบัน: <b>${fUSD(x.mkt)}</b></div>
        <div class='pill'>ราคาเฉลี่ยซื้อ: <b>${fUSD(x.avg)}</b> · ปัจจุบัน: <b>${fUSD(x.cur)}</b></div>
        <div class='pill ${cls}'>กำไร: <b>${fUSD(x.pnl)}</b> (${x.pnlPct.toFixed(2)}%)</div>
      </div>
      <div class='mt-3 flex items-center justify-between'>
        <div class='text-sm'>คำแนะนำ: <b>${adv.action}</b></div>
        <div class='text-xs muted'>${tagStr}</div>
      </div>
    </div>`;
  });

  box.innerHTML = cards.join('');
}

// --------- OCR binding ---------
document.getElementById('ocrFile').addEventListener('change', (e)=>{
  const f = e.target.files?.[0]; if(!f) return; handleOCRFile(f);
});

// Bind
document.getElementById('btnAddTrade').addEventListener('click', addTrade);
document.getElementById('btnExportCsv').addEventListener('click', exportCsv);
document.getElementById('btnClearAll').addEventListener('click', clearAll);

// Init
(function init(){
  const s = getSettings();
  document.getElementById('setTP').value = s.tp;
  document.getElementById('setSL').value = s.sl;
  document.getElementById('setE').value = s.earnDays;
  document.getElementById('tradeDate').value = new Date().toISOString().slice(0,10);
  renderPortfolio();
})();
