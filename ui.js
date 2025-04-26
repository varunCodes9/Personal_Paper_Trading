import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getTransactions } from './src/services/market-data.js'; 

const rl = readline.createInterface({ input, output });



async function showMenu() {
  console.log('\nOptions:');
  console.log('1. Show Portfolios'); 
  console.log('2. Show News'); 
  console.log('3. Run Daily Trade Job'); 
  console.log('4. Run Nightly Snapshot Job'); 
  console.log('5. Show Transactions');
  console.log('6. Exit');
  
  const answer = await rl.question('Select an option: ');
    const option = answer;
    switch (option) {
      case '1':
        console.log('User selected: Show Portfolios');
        console.log('Showing Portfolios'); 
        break;
      case '2':
        console.log('User selected: Show News');
        console.log('Showing News'); 
        break;
      case '3':
        console.log('User selected: Run Daily Trade Job');
        console.log('Running Daily Trade Job'); 
        break;
      case '4':
        console.log('User selected: Run Nightly Snapshot Job');
        console.log('Running Nightly Snapshot Job'); 
        break;
      case '5':
        console.log('User selected: Show Transactions');
        await showTransactions();
        break;
      case '6':
        console.log('User selected: Exit');
        console.log('Exiting...');
        rl.close();
        process.exit(0);
      default:
        console.log('Invalid option. Please try again.');

        break;
    }
    await showMenu();

}

async function showTransactions() {
    try {
        const transactions = getTransactions();
        if(transactions.length == 0){
            console.log("No transactions yet");
            return;
        }
        transactions.forEach(transaction => {
          console.log(`Transaction Id: ${transaction.transaction_id}, Type: ${transaction.type}, Stock Name: ${transaction.stock_name}, Price: ${transaction.price}, Quantity: ${transaction.quantity}, Date: ${transaction.date}`);
        });
    } catch (error) {
        console.error("Error showing transactions:", error);
    }
}


await showMenu();