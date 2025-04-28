// ui/ui.js
const portfolioTable = document.getElementById('portfolio-table').getElementsByTagName('tbody')[0];
const tradeLogsTable = document.getElementById('trade-logs-table').getElementsByTagName('tbody')[0];

const backendUrl = 'http://localhost:3000/api'; // URL to your backend

async function getCurrentPrice(symbol) {
    try {
        const response = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}.NS`);
        const data = await response.json();
        if (data.quoteResponse && data.quoteResponse.result && data.quoteResponse.result.length > 0) {
            return data.quoteResponse.result[0].regularMarketPrice;
        } else {
            console.error(`Failed to get price for ${symbol}:`, data);
            return null;
        }
    } catch (error) {
        console.error(`Failed to get price for ${symbol}:`, error);
        return null;
    }
}

async function fetchPortfolio() {
    const response = await fetch(`${backendUrl}/portfolio`);
    const portfolioData = await response.json();
    portfolioTable.innerHTML = ''; // Clear table

    for (const holding of portfolioData) {
        const currentPrice = await getCurrentPrice(holding.symbol);
        const unrealizedPnL = currentPrice !== null ? (currentPrice - holding.buyPrice) * holding.quantity : 'N/A';
        const row = portfolioTable.insertRow();
        row.insertCell().textContent = holding.symbol;
        row.insertCell().textContent = holding.quantity;
        row.insertCell().textContent = holding.buyPrice;
        row.insertCell().textContent = currentPrice !== null ? currentPrice.toFixed(2) : 'N/A';
        row.insertCell().textContent = unrealizedPnL !== 'N/A' ? unrealizedPnL.toFixed(2) : 'N/A';
    }
}

async function fetchTradeLogs() {
    const response = await fetch(`${backendUrl}/trades`);
    const tradeLogs = await response.json();
    tradeLogsTable.innerHTML = ''; // Clear table

    for (const trade of tradeLogs) {
        const row = tradeLogsTable.insertRow();
        row.insertCell().textContent = trade.action;
        row.insertCell().textContent = trade.symbol;
        row.insertCell().textContent = trade.quantity;
        row.insertCell().textContent = trade.price;
        row.insertCell().textContent = trade.capitalUsed;
        row.insertCell().textContent = trade.profitLoss;
        row.insertCell().textContent = new Date(trade.createdAt).toLocaleString();
    }
}

// Initial fetch
fetchPortfolio();
fetchTradeLogs();

// Update every 30 seconds
setInterval(() => {
    fetchPortfolio();
    fetchTradeLogs();
}, 30000);
