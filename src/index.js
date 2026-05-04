require('dotenv').config();
const app = require('./api/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`trustRent API running on port ${PORT}`);
  console.log(`Stellar network: ${process.env.STELLAR_NETWORK}`);
});
