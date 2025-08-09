// Bitkub-themed mobile PWA with Finnhub + mini charts (icons in root)
const LS_KEYS = { WATCHLIST:'dm_bk_watchlist', TRADES:'dm_bk_trades' };
const apiKey = window.FINNHUB_API_KEY;
const defaultSymbols = window.DEFAULT_SYMBOLS || [];

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault(); deferredPrompt = e;
  document.getElementById('btnA2HS')?.classList.remove('hidden');
});
document.getElementById('btnA2HS')?.addEventListener('click', async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice;
  deferredPrompt = null; document.getElementById('btnA2HS')?.classList.add('hidden');
});

function getWatchlist(){ try{ return JSON.parse(localStorage.getItem(LS_KEYS.WATCHLIST))||defaultSymbols; } catch{ return defaultSymbols; } }
function setWatchlist(v){ localStorage.setItem(LS_KEYS.WATCHLIST, JSON.stringify(v)); }
function getTrades(){ try{ return JSON.parse(localStorage.getItem(LS_KEYS.TRADES))||[]; } catch{ return []; } }
function setTrades(v){ localStorage.setItem(LS_KEYS.TRADES, JSON.stringify(v)); }

async function fetchQuote(symbol){
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const res = await fetch(url); if(!res.ok) throw new Error('quote failed'); return res.json();
}
// candles for mini chart (7–10 days)
async function fetchCandles(symbol){
  try{
    const now = Math.floor(Date.now()/1000);
    const weekAgo = now - 86400*10;
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${weekAgo}&to=${now}&token=${apiKey}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('candle failed');
    const data = await res.json();
    if(data.s !== 'ok') throw new Error('no candle');
    return data;
  } catch(e){ return null; }
}
const fUSD = (n)=> Number.isFinite(n)? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n):'-';

async function renderWatchlist(){
  const box = document.getElementById('watchlist'); box.innerHTML='';
  const syms = getWatchlist();
  const parts = await Promise.all(syms.map(async s=>{
    try{
      const [q, candles] = await Promise.all([fetchQuote(s), fetchCandles(s)]);
      const up = (q.d||0) >= 0;
      const id = 'ch_' + s;
      const chartHtml = `<canvas id='${id}' height='60'></canvas>`;
      const html = `<div class='p-3 card'>
        <div class='flex items-start justify-between gap-2'>
          <div>
            <div class='font-semibold text-[15px]'>${s}</div>
            <div class='text-[11px] muted'>Prev ${q.pc ?? '-'} · O ${q.o ?? '-'} · H ${q.h ?? '-'} · L ${q.l ?? '-'}</div>
          </div>
          <div class='text-right'>
            <div class='text-xl font-extrabold'>${q.c ?? '-'}</div>
            <div class='text-[12px] ${up?'text-[var(--green)]':'text-[var(--red)]'}'>${q.d ?? 0} (${q.dp ?? 0}%)</div>
            <div class='flex justify-end mt-2'>
              <button data-sym='${s}' class='px-2 py-1 bg-[#1f2632] hover:opacity-90 text-xs rounded removeSym'>ลบ</button>
            </div>
          </div>
        </div>
        <div class='mt-2'>${chartHtml}</div>
      </div>`;
      return { html, s, id, candles };
    }catch(e){
      return { html: `<div class='p-3 card flex items-center justify-between'>
        <div class='font-semibold'>${s}</div>
        <div class='text-[var(--red)] text-sm'>ดึงราคาไม่ได้</div>
        <button data-sym='${s}' class='px-2 py-1 bg-[#1f2632] hover:opacity-90 text-xs rounded removeSym'>ลบ</button>
      </div>` };
    }
  }));
  box.innerHTML = parts.map(p=>p.html).join('');

  // remove buttons
  box.querySelectorAll('.removeSym').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const s = btn.getAttribute('data-sym');
      const list = getWatchlist().filter(x=>x!==s);
      setWatchlist(list); renderWatchlist(); renderPortfolio();
    });
  });

  // draw charts
  parts.forEach(p=>{
    if(!p || !p.candles || !p.id) return;
    const ctx = document.getElementById(p.id);
    if(!ctx) return;
    const ds = p.candles.c || [];
    const labels = (p.candles.t || []).map(ts=> new Date(ts*1000).toLocaleDateString());
    new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ data: ds, tension: .35 }] },
      options: {
        plugins: { legend: { display:false } },
        scales: { x: { display:false }, y: { display:false } },
        elements: { point: { radius:0 } }
      }
    });
  });

  document.getElementById('lastSync').textContent = 'อัปเดต: ' + new Date().toLocaleTimeString();
}

function addSymbol(){
  const input = document.getElementById('symbolInput');
  const v = (input.value||'').trim().toUpperCase(); if(!v) return;
  const list = getWatchlist(); if(!list.includes(v)){ list.push(v); setWatchlist(list); renderWatchlist(); }
  input.value='';
}

function addTrade(){
  const d = document.getElementById('tradeDate').value || new Date().toISOString().slice(0,10);
  const sym = (document.getElementById('tradeSymbol').value||'').trim().toUpperCase();
  const side = document.getElementById('tradeSide').value;
  const qty = parseFloat(document.getElementById('tradeQty').value);
  const price = parseFloat(document.getElementById('tradePrice').value);
  const fee = parseFloat(document.getElementById('tradeFee').value||'0');
  const fx = parseFloat(document.getElementById('tradeFx').value||'0');
  const note = document.getElementById('tradeNote').value||'';
  if(!sym || !qty || !price){ alert('กรอก Symbol / จำนวน / ราคา ให้ครบ'); return; }
  const arr = getTrades(); arr.push({d,sym,side,qty,price,fee,fx,note,ts:Date.now()}); setTrades(arr);
  ['tradeQty','tradePrice','tradeFee','tradeNote'].forEach(id=>document.getElementById(id).value='');
  renderPortfolio();
}

function exportCsv(){
  const rows = getTrades();
  const header = ['date','symbol','side','qty','price_usd','fee_usd','fx_usd_thb','note'];
  const lines = [header.join(',')].concat(rows.map(r=>[r.d,r.sym,r.side,r.qty,r.price,r.fee,r.fx||'','"'+(r.note||'').replace(/"/g,'""')+'"'].join(',')));
  const blob = new Blob([lines.join('\\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='trades.csv'; a.click(); URL.revokeObjectURL(url);
}

function clearAll(){
  if(!confirm('ล้างข้อมูลทั้งหมดในเครื่องนี้?')) return;
  localStorage.removeItem(LS_KEYS.TRADES); renderPortfolio();
}

async function renderPortfolio(){
  const box = document.getElementById('portfolio'); const rows = getTrades();
  const by = {}; rows.forEach(r=>{ (by[r.sym]=by[r.sym]||[]).push(r); });
  const syms = Object.keys(by); const quotes = {};
  await Promise.all(syms.map(async s=>{ try{ quotes[s]=await fetchQuote(s); } catch{ quotes[s]=null; } }));

  const cards = syms.map(s=>{
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
    const pnlClass = pnl>=0 ? 'text-[var(--green)]' : 'text-[var(--red)]';
    return `<div class='p-4 card'>
      <div class='flex items-center justify-between'>
        <div class='font-semibold text-[15px]'>${s}</div>
        <div class='text-[11px] muted'>${arr.length} รายการ</div>
      </div>
      <div class='mt-2 grid grid-cols-2 gap-2 text-[13px]'>
        <div class='pill'>จำนวนคงเหลือ: <b>${qty.toFixed(4)}</b></div>
        <div class='pill'>ต้นทุนเฉลี่ย: <b>${fUSD(avg)}</b></div>
        <div class='pill'>ราคาปัจจุบัน: <b>${fUSD(cur)}</b></div>
        <div class='pill'>มูลค่า: <b>${fUSD(mkt)}</b></div>
        <div class='pill'>ค่าธรรมเนียมรวม: <b>${fUSD(fees)}</b></div>
        <div class='pill ${pnlClass}'>P/L: <b>${fUSD(pnl)}</b></div>
      </div>
    </div>`;
  });
  box.innerHTML = cards.length? cards.join('') : `<div class='muted text-sm'>ยังไม่มีรายการ — เพิ่มด้วยฟอร์มด้านบน</div>`;
}

// Bind
document.getElementById('btnAddSymbol').addEventListener('click', addSymbol);
document.getElementById('btnRefresh').addEventListener('click', renderWatchlist);
document.getElementById('btnAddTrade').addEventListener('click', addTrade);
document.getElementById('btnExportCsv').addEventListener('click', exportCsv);
document.getElementById('btnClearAll').addEventListener('click', clearAll);

// Init
(function init(){
  document.getElementById('tradeDate').value = new Date().toISOString().slice(0,10);
  if(!localStorage.getItem(LS_KEYS.WATCHLIST)) setWatchlist(defaultSymbols);
  renderWatchlist(); renderPortfolio();
  setInterval(renderWatchlist, 60_000);
})();
