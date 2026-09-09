require('dotenv').config();
const app = require('./api/app');

const PORT = process.env.PORT || 3000;

const UNSAFE_JWT_SECRETS = new Set(['', 'change_me', 'change_me_in_production', 'secret']);
if (!process.env.JWT_SECRET || UNSAFE_JWT_SECRETS.has(process.env.JWT_SECRET.toLowerCase())) {
  console.error(
    'FATAL: JWT_SECRET is missing or set to the example placeholder. ' +
      'Generate a strong secret, e.g. `openssl rand -base64 48`, and export it before starting.',
  );
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`trustRent API running on port ${PORT}`);
  console.log(`Stellar network: ${process.env.STELLAR_NETWORK}`);
});
