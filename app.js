// Bitkub-themed PWA (OCR-first). Show ONLY symbols that exist in trades.
const LS_KEYS = { TRADES:'dm_bk_trades' };
const apiKey = window.FINNHUB_API_KEY;

let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',(e)=>{ e.preventDefault(); deferredPrompt=e; });

function getTrades(){ try{ return JSON.parse(localStorage.getItem(LS_KEYS.TRADES))||[]; } catch{ return []; } }
function setTrades(v){ localStorage.setItem(LS_KEYS.TRADES, JSON.stringify(v)); }

async function fetchQuote(symbol){
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const res = await fetch(url); if(!res.ok) throw new Error('quote failed'); return res.json();
}
const fUSD = (n)=> Number.isFinite(n)? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n):'-';

function addTrade(){
  const d = document.getElementById('tradeDate').value || new Date().toISOString().slice(0,10);
  const sym = (document.getElementById('tradeSymbol').value||'').trim().toUpperCase();
  const side = document.getElementById('tradeSide').value;
  const qty = parseFloat(document.getElementById('tradeQty').value||'0');
  const price = parseFloat(document.getElementById('tradePrice').value||'0');
  const fee = parseFloat(document.getElementById('tradeFee').value||'0');
  const fx = parseFloat(document.getElementById('tradeFx').value||'0');
  const note = document.getElementById('tradeNote').value||'';
  if(!sym || (!qty && (side==='BUY'||side==='SELL')) ){ alert('กรอก Symbol และจำนวนให้ครบ'); return; }
  const arr = getTrades(); arr.push({d,sym,side,qty,price,fee,fx,note,ts:Date.now()}); setTrades(arr);
  ['tradeQty','tradePrice','tradeFee','tradeNote','tradeSymbol'].forEach(id=>document.getElementById(id).value='');
  renderPortfolio();
}

function exportCsv(){
  const rows = getTrades();
  const header = ['date','symbol','side','qty','price_usd','fee_usd','fx_usd_thb','note'];
  const lines = [header.join(',')].concat(rows.map(r=>[r.d,r.sym,r.side,r.qty,r.price,r.fee,r.fx||'','"'+(r.note||'').replace(/"/g,'""')+'"'].join(',')));
  const blob = new Blob([lines.join('\\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='trades.csv'; a.click(); URL.revokeObjectURL(url);
}

function clearAll(){ if(!confirm('ล้างข้อมูลทั้งหมดในเครื่องนี้?')) return; localStorage.removeItem(LS_KEYS.TRADES); renderPortfolio(); }

async function renderPortfolio(){
  const box = document.getElementById('portfolio'); const rows = getTrades();
  const by = {}; rows.forEach(r=>{ if(r.sym){ (by[r.sym]=by[r.sym]||[]).push(r); } });
  const syms = Object.keys(by);
  if(syms.length===0){ box.innerHTML = `<div class='muted text-sm'>ยังไม่มีรายการ — อัปโหลดภาพด้านบนหรือเพิ่มด้วยฟอร์ม</div>`; return; }

  const quotes = {}; await Promise.all(syms.map(async s=>{ try{ quotes[s]=await fetchQuote(s); } catch{ quotes[s]=null; } }));

  // Compute
  let items = syms.map(s=>{
    const q = quotes[s]; const arr = by[s];
    let qty=0, cost=0, fees=0;
    arr.forEach(r=>{
      if(r.side==='BUY'){ qty+=r.qty; cost+=r.qty*r.price; fees+=r.fee||0; }
      else if(r.side==='SELL'){ qty-=r.qty; cost-=r.qty*(cost/Math.max(qty+r.qty,1)); fees+=r.fee||0; }
      else if(r.side==='FEE'){ fees+=r.fee || r.price || 0; }
    });
    const avg = qty!==0? cost/qty : 0;
    const cur = q && q.c? q.c : 0;
    const mkt = qty*cur;
    const pnl = qty*(cur-avg)-fees;
    const pnlPct = avg!==0 ? ((cur-avg)/avg*100) : 0;
    const investedNow = qty>0 ? qty*avg : 0;
    return { s, qty, avg, cur, mkt, fees, pnl, pnlPct, investedNow, count: arr.length };
  });

  // Only show symbols present in trades (already) and sort by invested value desc, positions first
  items.sort((a,b)=> (b.investedNow>0)-(a.investedNow>0) || b.investedNow - a.investedNow || a.s.localeCompare(b.s));

  const cards = items.map(x=>{
    const cls = x.pnl>=0 ? 'text-[var(--green)]' : 'text-[var(--red)]';
    return `<div class='p-4 card'>
      <div class='flex items-center justify-between'>
        <div class='font-semibold text-[15px]'>${x.s}</div>
        <div class='text-[11px] muted'>${x.count} รายการ</div>
      </div>
      <div class='mt-2 grid grid-cols-2 gap-2 text-[13px]'>
        <div class='pill'>จำนวนคงเหลือ: <b>${x.qty.toFixed(6)}</b></div>
        <div class='pill'>มูลค่าปัจจุบัน: <b>${fUSD(x.mkt)}</b></div>
        <div class='pill'>ราคาเฉลี่ยซื้อ: <b>${fUSD(x.avg)}</b> · ปัจจุบัน: <b>${fUSD(x.cur)}</b></div>
        <div class='pill ${cls}'>กำไร: <b>${fUSD(x.pnl)}</b> (${x.pnlPct.toFixed(2)}%)</div>
        <div class='pill'>ค่าธรรมเนียมรวม: <b>${fUSD(x.fees)}</b></div>
      </div>
    </div>`;
  });

  box.innerHTML = cards.join('');
}

// ---------- OCR IMPORT ----------
const TH_MONTH = {
  "ม.ค.":1,"ก.พ.":2,"มี.ค.":3,"เม.ย.":4,"พ.ค.":5,"มิ.ย.":6,
  "ก.ค.":7,"ส.ค.":8,"ก.ย.":9,"ต.ค.":10,"พ.ย.":11,"ธ.ค.":12
};
function beToCE(twoDigit){ return (2500 + parseInt(twoDigit,10)) - 543; }
function parseThaiDate(s){
  const m = s.match(/(\d{{1,2}})\s+([ก-힣\.]+)\s+(\d{{2}}).*?(\d{{2}}):(\d{{2}}):(\d{{2}})/);
  if(!m) return null;
  const d = parseInt(m[1],10); const mon = TH_MONTH[m[2]]||1; const y = beToCE(m[3]);
  const hh=m[4], mm=m[5], ss=m[6];
  return `${y}-${String(mon).padStart(2,'0')}-${String(d).padStart(2,'0')} ${hh}:${mm}:${ss}`;
}

async function handleOCRFile(file){
  const status = document.getElementById('ocrStatus');
  status.textContent = 'กำลังอ่านภาพ... (OCR)';
  const { createWorker } = Tesseract;
  const worker = await createWorker('tha+eng');
  const { data:{ text } } = await worker.recognize(file);
  await worker.terminate();
  status.textContent = 'แปลงข้อความแล้ว กำลังวิเคราะห์...';

  const lines = text.split(/\\n+/).map(x=>x.trim()).filter(Boolean);
  const results = [];
  for(let i=0;i<lines.length;i++){
    const L = lines[i];

    // BUY / SELL
    let m = L.match(/^(ซื้อ|ขาย)\\s+([A-Z0-9\\.]+)/i);
    if(m){
      const side = m[1]==='ซื้อ'?'BUY':'SELL';
      const sym = m[2].toUpperCase();
      let qty=0, price=0, dateStr=null;
      for(let j=i+1;j<Math.min(i+6,lines.length);j++){
        const lj = lines[j];
        const mq = lj.match(/([0-9\\.\\,]+)\\s*หุ้น/); if(mq) qty = parseFloat(mq[1].replace(/,/g,''));
        const mp = lj.match(/ราคาที่ได้จริง\\s*([0-9\\.\\,]+)/); if(mp) price = parseFloat(mp[1].replace(/,/g,''));
        if(!dateStr && /\\d{{1,2}}\\s+[ก-힣\\.]+\\s+\\d{{2}}.*\\d{{2}}:\\d{{2}}:\\d{{2}}/.test(lj)) dateStr = parseThaiDate(lj);
      }
      if(sym && qty && price){
        results.push({ d: dateStr?.slice(0,10) || new Date().toISOString().slice(0,10), sym, side, qty, price, fee:0, fx:0, note:'OCR' });
      }
      continue;
    }

    // DIVIDEND
    m = L.match(/^ปันผล\\s+([A-Z0-9\\.]+)/i);
    if(m){
      const sym = m[1].toUpperCase(); let amount=0, dateStr=null;
      for(let j=i+1;j<Math.min(i+6,lines.length);j++){
        const lj = lines[j];
        const ma = lj.match(/([0-9\\.\\,]+)\\s*USD/); if(ma) amount = parseFloat(ma[1].replace(/,/g,''));
        if(!dateStr && /\\d{{1,2}}\\s+[ก-힣\\.]+\\s+\\d{{2}}.*\\d{{2}}:\\d{{2}}:\\d{{2}}/.test(lj)) dateStr = parseThaiDate(lj);
      }
      results.push({ d: dateStr?.slice(0,10) || new Date().toISOString().slice(0,10), sym, side:'DIV', qty:0, price:amount, fee:0, fx:0, note:'DIV OCR' });
      continue;
    }

    // FEE / TAX
    if(/ค่าธรรมเนียม|TAF Fee/i.test(L)){
      let amount=0, dateStr=null;
      for(let j=i+1;j<Math.min(i+4,lines.length);j++){
        const lj = lines[j];
        const ma = lj.match(/-?([0-9\\.\\,]+)\\s*USD/); if(ma) amount = parseFloat(ma[1].replace(/,/g,''));
        if(!dateStr && /\\d{{1,2}}\\s+[ก-힣\\.]+\\s+\\d{{2}}.*\\d{{2}}:\\d{{2}}:\\d{{2}}/.test(lj)) dateStr = parseThaiDate(lj);
      }
      results.push({ d: dateStr?.slice(0,10) || new Date().toISOString().slice(0,10), sym:'CASH', side:'FEE', qty:0, price:0, fee:amount, fx:0, note:'FEE OCR' });
      continue;
    }
    if(/ภาษีหัก|ภาษีหัก ณ/i.test(L)){
      let amount=0, dateStr=null;
      for(let j=i+1;j<Math.min(i+4,lines.length);j++){
        const lj = lines[j];
        const ma = lj.match(/-?([0-9\\.\\,]+)\\s*USD/); if(ma) amount = parseFloat(ma[1].replace(/,/g,''));
        if(!dateStr && /\\d{{1,2}}\\s+[ก-힣\\.]+\\s+\\d{{2}}.*\\d{{2}}:\\d{{2}}:\\d{{2}}/.test(lj)) dateStr = parseThaiDate(lj);
      }
      results.push({ d: dateStr?.slice(0,10) || new Date().toISOString().slice(0,10), sym:'CASH', side:'TAX', qty:0, price:0, fee:amount, fx:0, note:'TAX OCR' });
      continue;
    }
  }

  if(results.length===0){ status.textContent='อ่านภาพเสร็จ แต่ยังจับรายการไม่ได้ — ลองภาพที่คมชัดขึ้น'; return; }
  const arr = getTrades(); results.forEach(r=>arr.push(r)); setTrades(arr);
  status.textContent = `เพิ่มรายการจาก OCR แล้ว ${results.length} รายการ`;
  renderPortfolio();
}

document.getElementById('ocrFile').addEventListener('change',(e)=>{ const f=e.target.files?.[0]; if(!f) return; handleOCRFile(f); });

// ---- Bind UI ----
document.getElementById('btnAddTrade').addEventListener('click', addTrade);
document.getElementById('btnExportCsv').addEventListener('click', exportCsv);
document.getElementById('btnClearAll').addEventListener('click', clearAll);

// Init
(function init(){
  document.getElementById('tradeDate').value = new Date().toISOString().slice(0,10);
  renderPortfolio();
  document.getElementById('lastSync').textContent = 'พร้อมนำเข้า OCR';
})();
