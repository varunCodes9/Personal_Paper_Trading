function displayTransactions() {
  fetch('/api/transactions')
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then(transactions => {
      const transactionList = document.createElement('ul');
      transactions.forEach(transaction => {
        const listItem = document.createElement('li');
        listItem.textContent = `Transaction Id: ${transaction.transaction_id}, Type: ${transaction.type}, Stock Name: ${transaction.stock_name}, Price: ${transaction.price}, Quantity: ${transaction.quantity}, Date: ${transaction.date}`;
        transactionList.appendChild(listItem);
      });

      const body = document.body;
      body.innerHTML = '';
      body.appendChild(transactionList);
    })
    .catch(error => {
      console.error('There has been a problem with your fetch operation:', error);
      const body = document.body;
        body.innerHTML = '';
        const errorElement = document.createElement("p");
        errorElement.textContent = "There was an error fetching the transactions."
        body.appendChild(errorElement);
    });
}

displayTransactions();