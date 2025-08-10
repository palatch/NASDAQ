document.getElementById('imageInput').addEventListener('change', handleImageUpload);
document.getElementById('tradeForm').addEventListener('submit', saveTrade);

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.getElementById('previewCanvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

document.getElementById('startOCR').addEventListener('click', () => {
  const canvas = document.getElementById('previewCanvas');
  if (canvas.width === 0) return;
  const dataURL = canvas.toDataURL('image/png');
  Tesseract.recognize(dataURL, 'eng+tha', {
    logger: m => console.log(m)
  }).then(({ data: { text } }) => {
    document.getElementById('ocrResult').textContent = text;
    parseOCRText(text);
  });
});

function parseOCRText(text) {
  const type = text.includes('ซื้อ') ? 'BUY' : text.includes('ขาย') ? 'SELL' : '';
  const symbolMatch = text.match(/[A-Z]{2,5}/);
  const qtyMatch = text.match(/([0-9]+)\s*หุ้น/);
  const priceMatch = text.match(/ราคา\s*([0-9.]+)/);
  const feeMatch = text.match(/ค่าธรรมเนียม\s*([0-9.]+)/);
  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);

  if (type) document.getElementById('tradeType').value = type;
  if (symbolMatch) document.getElementById('symbol').value = symbolMatch[0];
  if (qtyMatch) document.getElementById('quantity').value = qtyMatch[1];
  if (priceMatch) document.getElementById('price').value = priceMatch[1];
  if (feeMatch) document.getElementById('fee').value = feeMatch[1];
  if (dateMatch) document.getElementById('tradeDate').value = dateMatch[1] + 'T00:00';
}

function saveTrade(e) {
  e.preventDefault();
  const trade = {
    date: document.getElementById('tradeDate').value,
    type: document.getElementById('tradeType').value,
    symbol: document.getElementById('symbol').value,
    quantity: parseFloat(document.getElementById('quantity').value),
    price: parseFloat(document.getElementById('price').value),
    fee: parseFloat(document.getElementById('fee').value || 0),
    note: document.getElementById('note').value
  };
  const trades = JSON.parse(localStorage.getItem('trades') || '[]');
  trades.push(trade);
  localStorage.setItem('trades', JSON.stringify(trades));
  displayPortfolio();
}

function displayPortfolio() {
  const trades = JSON.parse(localStorage.getItem('trades') || '[]');
  const portfolio = {};
  trades.forEach(t => {
    if (!portfolio[t.symbol]) portfolio[t.symbol] = { quantity: 0, cost: 0 };
    if (t.type === 'BUY') {
      portfolio[t.symbol].quantity += t.quantity;
      portfolio[t.symbol].cost += t.quantity * t.price + t.fee;
    } else if (t.type === 'SELL') {
      portfolio[t.symbol].quantity -= t.quantity;
      portfolio[t.symbol].cost -= t.quantity * t.price;
    }
  });
  const container = document.getElementById('portfolioDisplay');
  container.innerHTML = '';
  Object.keys(portfolio).forEach(symbol => {
    const p = portfolio[symbol];
    const avgPrice = p.quantity ? (p.cost / p.quantity).toFixed(2) : 0;
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `<strong>${symbol}</strong><br>จำนวน: ${p.quantity}<br>ราคาทุนเฉลี่ย: ${avgPrice}`;
    container.appendChild(div);
  });
}
