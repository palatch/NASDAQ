
const LS_TRADES='dm_trades_v8';
const LS_CFG='dm_cfg_v8';

function getTrades(){try{return JSON.parse(localStorage.getItem(LS_TRADES))||[]}catch{return[]}}
function setTrades(v){localStorage.setItem(LS_TRADES,JSON.stringify(v))}
function getCfg(){try{return JSON.parse(localStorage.getItem(LS_CFG))||{}}catch{return{}}}
function setCfg(v){localStorage.setItem(LS_CFG,JSON.stringify(v))}

// --- Settings
(function(){
  const cfg=getCfg();
  document.getElementById('cfg-finnhub').value=cfg.finnhub||'';
  document.getElementById('cfg-vision').value=cfg.vision||'';
  document.getElementById('btnSaveCfg').onclick=()=>{setCfg({finnhub:cfg.finnhub=document.getElementById('cfg-finnhub').value.trim(),vision:cfg.vision=document.getElementById('cfg-vision').value.trim()});document.getElementById('cfgStatus').textContent='บันทึกการตั้งค่าแล้ว ✅';};
  document.getElementById('btnClearKey').onclick=()=>{const c=getCfg();c.finnhub='';setCfg(c);document.getElementById('cfg-finnhub').value='';document.getElementById('cfgStatus').textContent='ล้างคีย์แล้ว';};
  document.getElementById('btnTestKey').onclick=testFinnhubKey;
})();

async function testFinnhubKey(){
  const key=(getCfg().finnhub||'').trim(); if(!key){document.getElementById('cfgStatus').textContent='ยังไม่ได้ใส่คีย์';return;}
  try{const r=await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${key}`);const j=await r.json();document.getElementById('cfgStatus').textContent=(j&&typeof j.c==='number')?'คีย์ใช้ได้ ✅':'คีย์อาจใช้ไม่ได้';}catch{document.getElementById('cfgStatus').textContent='ทดสอบคีย์ไม่สำเร็จ';}
}

// --- Helpers
const TH_MONTH={"ม.ค.":1,"ก.พ.":2,"มี.ค.":3,"เม.ย.":4,"พ.ค.":5,"มิ.ย.":6,"ก.ค.":7,"ส.ค.":8,"ก.ย.":9,"ต.ค.":10,"พ.ย.":11,"ธ.ค.":12};
function beToCE(y){const n=parseInt(y,10);return n>2400?n-543:2000+(n%100)}
function parseThaiDate(s){const m=s.match(/(\d{1,2})\s+([ก-๙\.]+)\s+(256\d|\d{2}).*?(\d{2}):(\d{2})(?::(\d{2}))?/);if(!m)return null;const d=String(parseInt(m[1],10)).padStart(2,'0');const mon=String(TH_MONTH[m[2]]||1).padStart(2,'0');const yyyy=String(beToCE(m[3]));const hh=m[4],mm=m[5],ss=m[6]||'00';return `${yyyy}-${mon}-${d} ${hh}:${mm}:${ss}`;}
const toUSD=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n):'-';

function fileToBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});}
async function tesseractOCR(file){const {createWorker}=Tesseract;const worker=await createWorker('eng+tha');const {data:{text}}=await worker.recognize(file);await worker.terminate();return text;}
async function visionOCR(file,kind){const cfg=getCfg();if(!cfg.vision)return null;const b64=await fileToBase64(file);try{const r=await fetch(cfg.vision,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageBase64:b64,kind})});if(!r.ok)return null;const j=await r.json();return j.text||null;}catch{return null}}

function fillQuickAddForm(f){const S=(id,v)=>{if(v!==undefined&&v!==null)document.getElementById(id).value=v};S('qa-date',f.date||'');S('qa-side',f.side||'BUY');S('qa-symbol',f.symbol||'');S('qa-qty',Number.isFinite(f.qty)?f.qty:'');S('qa-price',Number.isFinite(f.price)?f.price:'');S('qa-fee',Number.isFinite(f.fee)?f.fee:'');S('qa-note',(f.note||'OCR')+(f.total?` | total=${f.total}`:''));}

function parseDetailToFields(text){
  const T=text.replace(/\t/g,' ').split('\n').map(s=>s.trim()).filter(Boolean).join('\n');
  let side=null,symbol=null; let m=T.match(/^(BUY|SELL)\s+([A-Z0-9\.]+)/mi); if(m){side=m[1];symbol=m[2];}
  if(!m){const th=T.match(/^(ซื้อ|ขาย)\s+([A-Z0-9\.]+)/mi); if(th){side=th[1]==='ซื้อ'?'BUY':'SELL';symbol=th[2];}}
  const num=re=>{const m=T.match(re);return m?parseFloat(m[1].replace(/,/g,'')):null;}
  const price=num(/ราคาที่ได้จริง.*?([0-9.,]+)/i)||num(/(Actual|Price).*?([0-9.,]+)/i);
  const qty=num(/จำนวนหุ้น.*?([0-9.,]+)/i)||num(/([0-9.,]+)\s*(หุ้น|shares?)/i);
  const fee=(num(/(ค่าคอมมิช(ช|ซ)ัน|Commission).*?(-?[0-9.,]+)/i)||0)+(num(/TAF\s*Fee.*?(-?[0-9.,]+)/i)||0)+(num(/VAT.*?(-?[0-9.,]+)/i)||0);
  const total=num(/ยอดที่(ต้องชำระ|จะได้รับคืน)\s*([0-9.,]+)/i)||num(/Amount.*?([0-9.,]+)/i);
  let date=null; const d1=T.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(:\d{2})?)/); if(d1)date=`${d1[1]} ${d1[2].slice(0,8)}`; if(!date){const d2=T.match(/(\d{1,2}\s+[ก-๙\.]+\s+(256\d|\d{2}).*?\d{2}:\d{2}(:\d{2})?)/); if(d2)date=parseThaiDate(d2[1]);}
  return {side,symbol,qty,price,fee:fee||0,total,date,note:'OCR'};
}

// market
async function fetchQuote(sym){const key=(getCfg().finnhub||'').trim();if(!key)return null;try{const r=await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${key}`);if(!r.ok)return null;return await r.json()}catch{return null}}
async function fetchCandles(sym){const key=(getCfg().finnhub||'').trim();if(!key)return null;try{const now=Math.floor(Date.now()/1000),from=now-86400*8;const r=await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=D&from=${from}&to=${now}&token=${key}`);const j=await r.json();if(j.s!=='ok')return null;return j}catch{return null}}
function slope5(c){if(!c)return 0;const arr=c?.c||[];const last=arr.slice(-5);if(last.length<2)return 0;return (last[last.length-1]-last[0])/last[0]*100}
function advise({tp,sl},pos){const gainPct=pos.avg?((pos.cur-pos.avg)/pos.avg*100):0;let decision='ถือรอดู',reason=[];if(gainPct>=tp && slope5(pos.candles)<=0){{decision='ควรขาย';reason.push('ถึงเป้ากำไร & โมเมนตัมลบ')}}else if(gainPct<=sl){decision='พิจารณาตัดขาดทุน';reason.push('ถึงจุด SL')}else if(slope5(pos.candles)>0){decision='ถืออีก 3–5 วัน';reason.push('แนวโน้มขาขึ้น')}else{reason.push('ยังไม่ชัด')}return {decision,reason:reason.join(' · '),gainPct}}

async function renderPortfolio(){
  const tp=parseFloat(document.getElementById('tp').value||'5');
  const sl=parseFloat(document.getElementById('sl').value||'-10');
  const rows=getTrades(); const by={}; rows.forEach(r=>{if(r.sym && r.sym!=='CASH'){(by[r.sym]=by[r.sym]||[]).push(r)}});
  const syms=Object.keys(by); const box=document.getElementById('portfolio'); if(!syms.length){box.innerHTML='<div class="small">ยังไม่มีรายการ</div>';return}
  const quotes={},candles={}; await Promise.all(syms.map(async s=>{quotes[s]=await fetchQuote(s);candles[s]=await fetchCandles(s);}));
  const items=syms.map(s=>{let qty=0,cost=0,fees=0;by[s].forEach(r=>{if(r.side==='BUY'){qty+=r.qty;cost+=r.qty*r.price;fees+=r.fee||0;}else if(r.side==='SELL'){qty-=r.qty;fees+=r.fee||0;}});const avg=qty?cost/qty:0;const cur=quotes[s]?.c||0;const mkt=qty*cur;const pnl=qty*(cur-avg)-fees;const pnlPct=avg?(cur-avg)/avg*100:0;const adv=advise({tp,sl},{avg,cur,candles:candles[s]});return {s,qty,avg,cur,mkt,pnl,pnlPct,adv};});
  items.sort((a,b)=>b.mkt-a.mkt);
  box.innerHTML=items.map(x=>`<div class="card" style="margin:0">
    <div style="display:flex;justify-content:space-between"><b>${x.s}</b><span class="small">${toUSD(x.mkt)}</span></div>
    <div class="small">จำนวน: ${x.qty.toFixed(6)} | เฉลี่ย: ${toUSD(x.avg)} | ปัจจุบัน: ${toUSD(x.cur)}</div>
    <div class="small" style="color:${x.pnl>=0?'#00C087':'#F05454'}">กำไร: ${toUSD(x.pnl)} (${x.pnlPct.toFixed(2)}%)</div>
    <div class="small"><b>คำแนะนำ:</b> ${x.adv.decision} — ${x.adv.reason}</div>
  </div>`).join('');
}

// form
function readForm(){const g=id=>document.getElementById(id).value;return {d:g('qa-date')||new Date().toISOString().slice(0,10),sym:(g('qa-symbol')||'').toUpperCase(),side:g('qa-side'),qty:parseFloat(g('qa-qty')||'0')||0,price:parseFloat(g('qa-price')||'0')||0,fee:parseFloat(g('qa-fee')||'0')||0,note:g('qa-note')||'',ts:Date.now()};}
function validateRec(r){const e=[];if(!/^\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2}(:\d{2})?)?$/.test(r.d))e.push('วันที่ไม่ถูกต้อง');if(!/^[A-Z0-9\.]{1,10}$/.test(r.sym))e.push('สัญลักษณ์ไม่ถูกต้อง');if((r.side==='BUY'||r.side==='SELL')&&(!r.qty||!r.price))e.push('BUY/SELL ต้องมีจำนวนและราคา');return e;}
function saveForm(){const r=readForm();const errs=validateRec(r);const box=document.getElementById('formErr');if(errs.length){box.textContent='• '+errs.join('\n• ');return;}box.textContent='';const arr=getTrades();arr.push(r);setTrades(arr);renderPortfolio();alert('บันทึกแล้ว ✅');}
function clearForm(){['qa-date','qa-side','qa-symbol','qa-qty','qa-price','qa-fee','qa-note'].forEach(id=>document.getElementById(id).value='');}

// OCR flow
async function handleOCRtoForm(file,kind){const status=document.getElementById('ocrStatus');status.textContent='กำลังประมวลผล...';let text=null;try{text=await visionOCR(file,kind);}catch{}if(!text){try{text=await tesseractOCR(file);}catch(e){status.textContent='เกิดข้อผิดพลาด OCR';return;}}document.getElementById('raw').textContent=(text||'').slice(0,2000);const fields=parseDetailToFields(text||'');fillQuickAddForm(fields);status.textContent='เติมค่าลงฟอร์มแล้ว';}

// upload-only binding
document.getElementById('btnPickList').onclick=()=>document.getElementById('fileList').click();
document.getElementById('btnPickDetail').onclick=()=>document.getElementById('fileDetail').click();
document.getElementById('fileList').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)handleOCRtoForm(f,'list');});
document.getElementById('fileDetail').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)handleOCRtoForm(f,'detail');});

document.getElementById('btnSave').onclick=saveForm;
document.getElementById('btnClear').onclick=clearForm;
document.getElementById('btnRefresh').onclick=renderPortfolio;
['tp','sl','earnDays'].forEach(id=>document.getElementById(id).addEventListener('change',renderPortfolio));

renderPortfolio();
