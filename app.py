
import os
import json
import requests
from flask import Flask, request, render_template, redirect, send_file

app = Flask(__name__)

STOCKS_FILE = "stocks.json"

def load_stocks():
    if os.path.exists(STOCKS_FILE):
        with open(STOCKS_FILE, "r") as f:
            return json.load(f)
    return []

def save_stocks(stocks):
    with open(STOCKS_FILE, "w") as f:
        json.dump(stocks, f, indent=2)

def get_current_price(symbol, api_key):
    url = f"https://finnhub.io/api/v1/quote?symbol={symbol}&token={api_key}"
    try:
        response = requests.get(url)
        data = response.json()
        return data.get("c", None)
    except:
        return None

def sort_stocks(stocks):
    return sorted(stocks, key=lambda x: x.get("profit", 0), reverse=True)

@app.route("/", methods=["GET", "POST"])
def index():
    stocks = load_stocks()
    message = ""
    if request.method == "POST":
        symbol = request.form.get("symbol").upper()
        buy_price = float(request.form.get("buy_price"))
        target_profit = float(request.form.get("target_profit"))
        api_key = request.form.get("api_key")

        current_price = get_current_price(symbol, api_key)
        if current_price is None:
            message = f"❌ ไม่สามารถดึงราคาปัจจุบันของ {symbol} ได้"
        else:
            profit = round((current_price - buy_price), 2)
            status = "✅ Sell" if profit >= target_profit else "Hold"
            stocks.append({
                "symbol": symbol,
                "buy_price": buy_price,
                "current_price": current_price,
                "profit": profit,
                "target_profit": target_profit,
                "status": status
            })
            save_stocks(stocks)
            return redirect("/")

    sorted_stocks = sort_stocks(stocks)
    return render_template("index.html", stocks=sorted_stocks, message=message)

@app.route("/favicon.ico")
def favicon():
    return send_file("favicon.ico", mimetype="image/x-icon")

if __name__ == "__main__":
    app.run(debug=True)
