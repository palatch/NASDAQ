// ====== Storage ======
const LS_TRADES = 'dm_adv_trades_v3';
const apiKey = window.FINNHUB_API_KEY;

// ====== Utils ======
const TH_MONTH = {"ม.ค.":1,"ก.พ.":2,"มี.ค.":3,"เม.ย.":4,"พ.ค.":5,"มิ.ย.":6,"ก.ค.":7,"ส.ค.":8,"ก.ย.":9,"ต.ค.":10,"พ.ย.":11,"ธ.ค.":12};
function beToCE(y){const n=parseInt(y,10);return n>2400?n-543:2000+(n%100);}
function parseThaiDate(s){
  const m = s.match(/(\d{1,2})\s+([ก-힣\.]+)\s+(256\d|\d{2}).*?(\d{2}):(\d{2})(?::(\d{2}))?/);
  if(!m) return null;
  const d=String(parseInt(m[1],10)).padStart(2,'0');
  const mon=String(TH_MONTH[m[2]]||1).padStart(2,'0');
  const yyyy=String(beToCE(m[3]));
  const hh=m[4], mm=m[5], ss=m[6]||'00';
  return `${yyyy}-${mon}-${d} ${hh}:${mm}:${ss}`;
}
const toUSD = n => Number.isFinite(n) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n) : '-';

// ====== OCR helpers ======
async function preprocess(file){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=>{
      const SCALE = 1.6;
      const c = document.createElement('canvas'); c.width=img.width*SCALE; c.height=img.height*SCALE;
      const ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=true;
      ctx.drawImage(img,0,0,c.width,c.height);
      const id=ctx.getImageData(0,0,c.width,c.height); const d=id.data;
      for(let i=0;i<d.length;i+=4){
        const g = d[i]*.299 + d[i+1]*.587 + d[i+2]*.114;
        const v = Math.max(0, Math.min(255, 1.45*(g-128)+128));
        d[i]=d[i+1]=d[i+2]=v;
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

// ====== Parsers ======
function parseDetail(text){
  const lines = text.split(/\n+/).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
  let side=null, sym=null, qty=null, price=null, total=null, gross=null, fee=0, taf=0, vat=0, dateISO=null;
  let wantNextQty=false, wantNextPrice=false;
  for(let i=0;i<lines.length;i++){
    const L=lines[i];

    let m = L.match(/^(ซื้อ|ขาย)\s+([A-Z0-9\.]+)/i);
    if(m){ side=m[1]==='ซื้อ'?'BUY':'SELL'; sym=m[2].toUpperCase(); continue; }

    if(!dateISO && /(\d{1,2})\s+[ก-힣\.]+\s+(256\d|\d{2}).*\d{2}:\d{2}/.test(L)) dateISO=parseThaiDate(L);

    if(wantNextQty){ m=L.match(/([0-9.,]+)/); if(m) qty=parseFloat(m[1].replace(/,/g,'')); wantNextQty=false; continue; }
    if(wantNextPrice){ m=L.match(/([0-9.,]+)/); if(m) price=parseFloat(m[1].replace(/,/g,'')); wantNextPrice=false; continue; }

    if(/จำนวนหุ้น/i.test(L)){ m=L.match(/จำนวนหุ้น.*?([0-9.,]+)/i); if(m) qty=parseFloat(m[1].replace(/,/g,'')); else wantNextQty=true; continue; }
    m = L.match(/([0-9.,]+)\s*หุ้น/); if(m){ qty=parseFloat(m[1].replace(/,/g,'')); continue; }

    if(/ราคาที่ได้จริง/i.test(L)){ m=L.match(/ราคาที่ได้จริง.*?([0-9.,]+)/i); if(m) price=parseFloat(m[1].replace(/,/g,'')); else wantNextPrice=true; continue; }

    m = L.match(/ยอดที่(ต้องชำระ|จะได้รับคืน)\s*([0-9.,]+)\s*USD?/i); if(m){ total=parseFloat(m[2].replace(/,/g,'')); continue; }
    m = L.match(/มูลค่าหุ้นที่(ซื้อ|ขาย)\s*([0-9.,]+)\s*USD?/i); if(m){ gross=parseFloat(m[2].replace(/,/g,'')); continue; }

    m = L.match(/ค่าคอมมิช(ช|ซ)ัน.*?(-?[0-9.,]+)\s*USD?/i); if(m){ fee+=parseFloat(m[1].replace(/,/g,'')); continue; }
    m = L.match(/ค่าธรรมเนียมการขาย\s*\(TAF\s*Fee\).*?(-?[0-9.,]+)\s*USD?/i); if(m){ taf+=parseFloat(m[1].replace(/,/g,'')); continue; }
    m = L.match(/VAT.*?(-?[0-9.,]+)\s*USD?/i); if(m){ vat+=parseFloat(m[1].replace(/,/g,'')); continue; }
  }
  if(side && sym && qty!=null && price!=null){
    return [{ d:(dateISO||new Date().toISOString().slice(0,10)), sym, side, qty, price, fee:(fee+taf+vat)||0, fx:0, note:'OCR:DETAIL', ts:Date.now() }];
  }
  return [];
}
function parseList(text){
  const lines = text.split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const out=[];
  for(let i=0;i<lines.length;i++){
    const L=lines[i];
    let m = L.match(/^(ซื้อ|ขาย)\s+([A-Z0-9\.]+)/i);
    if(m){
      const side=m[1]==='ซื้อ'?'BUY':'SELL'; const sym=m[2].toUpperCase();
      let qty=null, price=null, dateISO=null;
      for(let j=i+1;j<Math.min(i+7,lines.length);j++){
        const lj=lines[j];
        const mq = lj.match(/จำนวนหุ้น\s*([0-9\.,]+)/i) || lj.match(/([0-9\.,]+)\s*หุ้น/);
        if(mq) qty=parseFloat(mq[1].replace(/,/g,''));
        const mp = lj.match(/ราคาที่ได้จริง\s*([0-9\.,]+)/);
        if(mp) price=parseFloat(mp[1].replace(/,/g,''));
        if(!dateISO && /(\d{1,2})\s+[ก-힣\.]+\s+(256\d|\d{2}).*\d{2}:\d{2}/.test(lj)) dateISO=parseThaiDate(lj);
      }
      if(sym && qty!=null && price!=null) out.push({ d:(dateISO||new Date().toISOString().slice(0,10)), sym, side, qty, price, fee:0, fx:0, note:'OCR:LIST', ts:Date.now() });
      continue;
    }
    m = L.match(/^ปันผล\s+([A-Z0-9\.]+)/i);
    if(m){
      const sym=m[1].toUpperCase(); let amount=null, dateISO=null;
      for(let j=i+1;j<Math.min(i+6,lines.length);j++){
        const lj=lines[j];
        const ma=lj.match(/([0-9\.,]+)\s*USD/); if(ma) amount=parseFloat(ma[1].replace(/,/g,''));
        if(!dateISO && /(\d{1,2})\s+[ก-힣\.]+\s+(256\d|\d{2}).*\d{2}:\d{2}/.test(lj)) dateISO=parseThaiDate(lj);
      }
      if(amount!=null) out.push({ d:(dateISO||new Date().toISOString().slice(0,10)), sym, side:'DIV', qty:0, price:amount, fee:0, fx:0, note:'DIV OCR', ts:Date.now() });
      continue;
    }
  }
  return out;
}

// ====== Market ======
async function fetchQuote(symbol){
  const url=`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const r=await fetch(url); if(!r.ok) throw new Error('quote fail'); return r.json();
}
async function fetchCandles(symbol){
  try{
    const now=Math.floor(Date.now()/1000), from=now-86400*8;
    const url=`https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${now}&token=${apiKey}`;
    const r=await fetch(url); if(!r.ok) return null; const j=await r.json(); if(j.s!=='ok') return null; return j;
  }catch{return null}
}
async function fetchEarningsUpcoming(symbol, days){
  try{
    const d0=new Date(), d1=new Date(Date.now()+days*86400000);
    const fmt=d=>d.toISOString().slice(0,10);
    const url=`https://finnhub.io/api/v1/calendar/earnings?from=${fmt(d0)}&to=${fmt(d1)}&symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const r=await fetch(url); if(!r.ok) return null; const j=await r.json();
    const arr=j.earningsCalendar||j.result||[]; return arr && arr.length?arr[0]:null;
  }catch{return null}
}
function slope5(c){ if(!c) return 0; const arr=c.c||[]; const last=arr.slice(-5); if(last.length<2) return 0; return (last[last.length-1]-last[0])/last[0]*100; }

// ====== Advice & render ======
function advise({tp,sl,earnDays}, pos, isDividendStock){
  if(isDividendStock) return { decision:'ถือรับปันผล', tags:[{k:'หุ้นปันผล',t:'t-amber'}], reason:'เน้นรับปันผล', gainPct: pos.avg?((pos.cur-pos.avg)/pos.avg*100):0 };
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

async function renderPortfolio(){
  const tp=parseFloat(document.getElementById('tp').value||'5');
  const sl=parseFloat(document.getElementById('sl').value||'-10');
  const earnDays=parseInt(document.getElementById('earnDays').value||'3',10);

  const rows = JSON.parse(localStorage.getItem(LS_TRADES)||'[]');
  const by={}; rows.forEach(r=>{ if(r.sym && r.sym!=='CASH'){ (by[r.sym]=by[r.sym]||[]).push(r);} });
  const syms=Object.keys(by);
  const box=document.getElementById('portfolio');
  if(!syms.length){ box.innerHTML=`<div class='text-sm muted'>ยังไม่มีรายการจาก OCR — กดปุ่มอัปโหลดรูปด้านบน</div>`; return; }

  const quotes={}, candles={}, earnings={};
  await Promise.all(syms.map(async s=>{
    try{ quotes[s]=await fetchQuote(s);}catch{quotes[s]=null;}
    candles[s]=await fetchCandles(s);
    earnings[s]=await fetchEarningsUpcoming(s, earnDays);
  }));

  let items = syms.map(s=>{
    let qty=0,cost=0,fees=0, hasDiv=false;
    by[s].forEach(r=>{
      if(r.side==='BUY'){ qty+=r.qty; cost+=r.qty*r.price; fees+=r.fee||0; }
      else if(r.side==='SELL'){ qty-=r.qty; cost-=r.qty*(cost/Math.max(qty+r.qty,1)); fees+=r.fee||0; }
      else if(r.side==='DIV'){ hasDiv=true; }
    });
    const avg=qty? cost/qty:0;
    const cur=quotes[s]?.c||0;
    const momo=slope5(candles[s]);
    const earnSoon=!!earnings[s];
    const mkt=qty*cur, pnl=qty*(cur-avg)-fees, pnlPct=avg? (cur-avg)/avg*100:0;
    const adv=advise({tp,sl,earnDays},{avg,cur,qty,earnSoon,momo},hasDiv);
    return { s, qty, avg, cur, mkt, fees, pnl, pnlPct, adv, count:by[s].length, earn:earnings[s], dividend:hasDiv };
  });

  items.sort((a,b)=> (b.adv.tags.some(t=>t.k==='งบใกล้ออก') - a.adv.tags.some(t=>t.k==='งบใกล้ออก')) || b.mkt-a.mkt );

  box.innerHTML = items.map(x=>{
    const pnlCls = x.pnl>=0?'color:var(--green)':'color:var(--red)';
    const tagHtml = x.adv.tags.map(t=>`<span class="tag ${t.t}">${t.k}</span>`).join(' ');
    const earnTxt = x.earn? `<div class="text-xs muted">งบ: ${x.earn.date||x.earn.EPSReportDate||''}</div>`:'';
    return `<div class="p-4 card">
      <div class="flex items-center justify-between">
        <div class="font-semibold text-[15px]">${x.s}${x.dividend?' <span class="tag t-amber">หุ้นปันผล</span>':''}</div>
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

function renderDividendSummary(rows){
  const divs = rows.filter(r=>r.side==='DIV');
  if(!divs.length){ document.getElementById('divSummary').innerHTML='<span class="muted text-sm">ยังไม่มีรายการปันผล</span>'; const ctx=document.getElementById('divChart').getContext('2d'); if(window._divChart){window._divChart.destroy();} window._divChart=new Chart(ctx,{type:'bar',data:{labels:[],datasets:[{label:'Dividend (USD)',data:[]}]},options:{plugins:{legend:{display:false}}}}); return; }
  const byMonth = {};
  divs.forEach(r=>{ const m=(r.d||'').slice(0,7)||new Date().toISOString().slice(0,7); byMonth[m]=(byMonth[m]||0)+(r.price||0); });
  const months = Object.keys(byMonth).sort();
  const totalYear = divs.reduce((a,b)=>a+(b.price||0),0);
  document.getElementById('divSummary').innerHTML = `รวมทั้งปี: <b>${toUSD(totalYear)}</b>`;
  const ctx=document.getElementById('divChart').getContext('2d');
  if(window._divChart) window._divChart.destroy();
  window._divChart = new Chart(ctx,{type:'bar', data:{labels:months, datasets:[{label:'Dividend (USD)', data:months.map(m=>byMonth[m])}]}, options:{responsive:true, plugins:{legend:{display:false}}} });
}

// ====== Alerts ======
async function checkAlertsOnce(){
  if(Notification.permission!=='granted') return;
  const rows=JSON.parse(localStorage.getItem(LS_TRADES)||'[]'); const by={};
  rows.forEach(r=>{ if(r.sym && r.sym!=='CASH'){ (by[r.sym]=by[r.sym]||[]).push(r);} });
  const syms=Object.keys(by); if(!syms.length) return;
  const tp=parseFloat(document.getElementById('tp').value||'5');
  const sl=parseFloat(document.getElementById('sl').value||'-10');
  for(const s of syms){
    try{
      const q=await fetchQuote(s);
      let qty=0,cost=0; by[s].forEach(r=>{ if(r.side==='BUY'){qty+=r.qty; cost+=r.qty*r.price;} else if(r.side==='SELL'){ qty-=r.qty; cost-=r.qty*(cost/Math.max(qty+r.qty,1)); } });
      const avg=qty?cost/qty:0; const cur=q?.c||0; const gainPct=avg?((cur-avg)/avg*100):0;
      if(gainPct>=tp){ new Notification(`🚨 ${s} ถึงเป้ากำไร ${tp}%`,{body:`กำไรปัจจุบัน ~${gainPct.toFixed(2)}%`}); }
      if(gainPct<=sl){ new Notification(`⚠️ ${s} ขาดทุนถึง ${sl}%`,{body:`กำไรปัจจุบัน ~${gainPct.toFixed(2)}%`}); }
    }catch{}
  }
}
setInterval(checkAlertsOnce, 60*1000);

// ====== Handlers ======
async function handleFile(file, kind){
  const status=document.getElementById('ocrStatus');
  status.textContent='กำลังประมวลผลภาพ...';
  const blob=await preprocess(file);
  const text=await runOCR(blob||file);
  document.getElementById('raw').textContent=text.slice(0,2000);
  const rows = kind==='detail' ? parseDetail(text) : parseList(text);
  if(!rows.length){ status.textContent='อ่านภาพเสร็จ แต่ยังจับรายการไม่ได้ — ซูมตัวเลขให้ใหญ่ขึ้นแล้วแคปใหม่'; return; }
  const arr=JSON.parse(localStorage.getItem(LS_TRADES)||'[]'); rows.forEach(r=>arr.push(r)); localStorage.setItem(LS_TRADES, JSON.stringify(arr));
  status.textContent=`เพิ่มรายการแล้ว ${rows.length} รายการ (${kind==='detail'?'หน้ารายละเอียด':'หน้ารายการรวม'})`;
  renderPortfolio();
}

// ====== Bind UI ======
document.getElementById('fileList').addEventListener('change',e=>{const f=e.target.files?.[0]; if(f) handleFile(f,'list');});
document.getElementById('fileDetail').addEventListener('change',e=>{const f=e.target.files?.[0]; if(f) handleFile(f,'detail');});
document.getElementById('btnRefresh').addEventListener('click',renderPortfolio);
document.getElementById('tp').addEventListener('change',renderPortfolio);
document.getElementById('sl').addEventListener('change',renderPortfolio);
document.getElementById('earnDays').addEventListener('change',renderPortfolio);
document.getElementById('btnEnableNotify').addEventListener('click',async()=>{
  try{ const p=await Notification.requestPermission(); alert(p==='granted'?'เปิดแจ้งเตือนแล้ว ✅':'ยังไม่ได้อนุญาตการแจ้งเตือน'); }
  catch{ alert('อุปกรณ์นี้ไม่รองรับ Notification'); }
});

// ====== Init ======
renderPortfolio();
