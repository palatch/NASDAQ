document.getElementById('imageInput').addEventListener('change', async function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  img.onload = () => {
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('imagePreview').appendChild(img);
  };

  document.getElementById('ocrStatus').textContent = 'กำลังประมวลผล OCR...';
  const { data: { text } } = await Tesseract.recognize(file, 'eng+tha');
  document.getElementById('ocrText').value = text;
  document.getElementById('ocrStatus').textContent = 'OCR เสร็จแล้ว';

  autoFillForm(text);
});

document.getElementById('convertText').addEventListener('click', () => {
  const text = document.getElementById('ocrText').value;
  autoFillForm(text);
});

function autoFillForm(text) {
  const side = /ซื้อ/.test(text) ? 'BUY' : /ขาย/.test(text) ? 'SELL' : '';
  const symbolMatch = text.match(/(?:หุ้น|symbol)[:\s]?([A-Z]{2,5})/);
  const qtyMatch = text.match(/จำนวน[:\s]?([\d,]+)/);
  const priceMatch = text.match(/ราคา[:\s]?([\d.]+)/);
  const feeMatch = text.match(/ค่าธรรมเนียม[:\s]?([\d.]+)/);
  const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);

  if (side) document.getElementById('side').value = side;
  if (symbolMatch) document.getElementById('symbol').value = symbolMatch[1];
  if (qtyMatch) document.getElementById('qty').value = qtyMatch[1].replace(/,/g, '');
  if (priceMatch) document.getElementById('price').value = priceMatch[1];
  if (feeMatch) document.getElementById('fee').value = feeMatch[1];
  if (dateMatch) {
    const yyyy = parseInt(dateMatch[3]) > 2500 ? parseInt(dateMatch[3]) - 543 : parseInt(dateMatch[3]);
    const mm = dateMatch[2].padStart(2, '0');
    const dd = dateMatch[1].padStart(2, '0');
    document.getElementById('date').value = `${yyyy}-${mm}-${dd}T09:00:00`;
  }
}
