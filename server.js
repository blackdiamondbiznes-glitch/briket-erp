require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Test endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Briket ERP API ishlayapti!',
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Server ${PORT} portda ishga tushdi`);
});