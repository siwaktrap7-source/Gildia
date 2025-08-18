
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Discord Guild Bot is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[WEB] HTTP server listening on port ${PORT}`);
});
