import yahooFinance from 'yahoo-finance2';
import { RSI } from 'technicalindicators';

let transactionIdCounter = 1;
const transactions = [];

export function getTransactions() {
    return transactions;
}

export function addTransaction(transaction) {
    const newTransaction = {
        transaction_id: transactionIdCounter++,
        type: transaction.type,
        stock_name: transaction.stock_name,
        price: transaction.price,
        quantity: transaction.quantity,
        date: transaction.date,
    };
    transactions.push(newTransaction);
    return newTransaction;
}

export async function getRSI(symbol, period = 14) {
    try {
        // Get 3 months of daily data (enough for RSI calculation)
        const { quotes } = await yahooFinance.chart(`${symbol}.NS`, {
            period1: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            period2: new Date().toISOString().split('T')[0],
            interval: '1d'
        });

        if (!quotes || quotes.length === 0) {
            throw new Error('No price data available');
        }

        const closes = quotes
            .map(q => q.close)
            .filter(close => close !== null && close !== undefined);

        if (closes.length < period) {
            throw new Error(`Not enough data points (${closes.length}) for RSI calculation`);
        }

        return RSI.calculate({ values: closes, period });
    } catch (error) {
        console.error(`Failed to get RSI for ${symbol}:`, error.message);
        return null;
    }
}