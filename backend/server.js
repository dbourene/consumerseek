const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/markers', (req, res) => {
  res.json([
    { lat: 48.8566, lng: 2.3522, value: 123 },
    { lat: 51.5074, lng: -0.1278, value: 456 }
  ]);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
