
// Sample portfolio data for demonstration
const portfolio = [
  { symbol: "AAPL", avgPrice: 150, currentPrice: 165 },
  { symbol: "TSLA", avgPrice: 700, currentPrice: 620 },
  { symbol: "PTT", avgPrice: 35, currentPrice: 36 }
];

// Function to check TP/SL and show alerts
function checkTPSL(tpPercent, slPercent) {
  portfolio.forEach(stock => {
    const tpPrice = stock.avgPrice * (1 + tpPercent / 100);
    const slPrice = stock.avgPrice * (1 - slPercent / 100);
    let message = "";

    if (stock.currentPrice >= tpPrice) {
      message = `✅ ${stock.symbol}: ราคาถึงจุด Take Profit แล้ว → ควรพิจารณาขาย`;
    } else if (stock.currentPrice <= slPrice) {
      message = `⚠️ ${stock.symbol}: ราคาต่ำกว่าจุด Stop Loss → ควรพิจารณาตัดขาดทุน`;
    } else {
      message = `ℹ️ ${stock.symbol}: ยังไม่ถึงจุด TP/SL`;
    }

    const alertBox = document.createElement("div");
    alertBox.textContent = message;
    alertBox.style.padding = "10px";
    alertBox.style.margin = "5px";
    alertBox.style.borderRadius = "8px";
    alertBox.style.background = "#222";
    alertBox.style.color = "#fff";
    alertBox.style.fontSize = "16px";
    document.getElementById("alerts").appendChild(alertBox);
  });
}

// Example usage: check TP 10%, SL 5% when refresh button is clicked
document.getElementById("refreshBtn").addEventListener("click", () => {
  document.getElementById("alerts").innerHTML = "";
  const tp = parseFloat(document.getElementById("tpInput").value) || 10;
  const sl = parseFloat(document.getElementById("slInput").value) || 5;
  checkTPSL(tp, sl);
});
