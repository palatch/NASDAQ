document.getElementById('startOCR').addEventListener('click', () => {
  const input = document.getElementById('imageInput');
  const canvas = document.getElementById('canvasPreview');
  const ctx = canvas.getContext('2d');
  const file = input.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    Tesseract.recognize(img, 'eng+tha').then(({ data: { text } }) => {
      document.getElementById('ocrText').value = text;
      parseOCR(text);
    });
  };
  img.src = URL.createObjectURL(file);
});

function parseOCR(text) {
  const form = document.getElementById('tradeForm');
  const side = /ขาย/.test(text) ? 'SELL' : 'BUY';
  const symbol = text.match(/[A-Z]{2,5}/)?.[0] || '';
  const qty = text.match(/(\d{1,5})\s*หุ้น/)?.[1] || '';
  const price = text.match(/ราคา.?(\d+(\.\d+)?)/)?.[1] || '';
  const fee = text.match(/ค่าธรรมเนียม.?(\d+(\.\d+)?)/)?.[1] || '';
  const date = new Date().toISOString().slice(0,16);

  form.date.value = date;
  form.side.value = side;
  form.symbol.value = symbol;
  form.qty.value = qty;
  form.price.value = price;
  form.fee.value = fee;
}

document.getElementById('tradeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    date: document.getElementById('date').value,
    side: document.getElementById('side').value,
    symbol: document.getElementById('symbol').value,
    qty: parseFloat(document.getElementById('qty').value),
    price: parseFloat(document.getElementById('price').value),
    fee: parseFloat(document.getElementById('fee').value),
    note: document.getElementById('note').value,
    timestamp: Date.now()
  };
  const portfolio = JSON.parse(localStorage.getItem('portfolio') || '[]');
  portfolio.push(data);
  localStorage.setItem('portfolio', JSON.stringify(portfolio));
  alert('บันทึกเรียบร้อย');
});

document.getElementById('refreshPortfolio').addEventListener('click', () => {
  const tp = parseFloat(document.getElementById('tp').value);
  const sl = parseFloat(document.getElementById('sl').value);
  const portfolio = JSON.parse(localStorage.getItem('portfolio') || '[]');
  const summary = {};

  portfolio.forEach(trade => {
    const sym = trade.symbol;
    if (!summary[sym]) summary[sym] = { qty: 0, cost: 0 };
    if (trade.side === 'BUY') {
      summary[sym].qty += trade.qty;
      summary[sym].cost += trade.qty * trade.price + (trade.fee || 0);
    } else if (trade.side === 'SELL') {
      summary[sym].qty -= trade.qty;
      summary[sym].cost -= trade.qty * trade.price;
    }
  });

  const container = document.getElementById('portfolioCards');
  container.innerHTML = '';
  Object.keys(summary).forEach(sym => {
    const avgPrice = summary[sym].cost / summary[sym].qty;
    const currentPrice = avgPrice * (1 + tp / 100); // mock price
    const gain = (currentPrice - avgPrice) * summary[sym].qty;
    const tag = gain > 0 ? '✅ ถือ' : gain < 0 ? '⚠️ ขาดทุน' : '➖';

    const card = document.createElement('div');
    card.className = 'portfolio-card';
    card.innerHTML = `<strong>${sym}</strong><br>
      จำนวน: ${summary[sym].qty}<br>
      ราคาทุนเฉลี่ย: ${avgPrice.toFixed(2)}<br>
      ราคาปัจจุบัน: ${currentPrice.toFixed(2)}<br>
      กำไร/ขาดทุน: ${gain.toFixed(2)}<br>
      คำแนะนำ: ${tag}`;
    container.appendChild(card);
  });
});
