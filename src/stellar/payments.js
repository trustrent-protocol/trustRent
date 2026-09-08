const {
  Keypair,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  Memo,
} = require('@stellar/stellar-sdk');
const { server, networkPassphrase, getUSDC } = require('./client');

/**
 * Submit a rent payment, splitting agent commission if applicable.
 *
 * @param {object} opts
 * @param {string} opts.tenantSecretKey
 * @param {string} opts.landlordPublicKey
 * @param {string} opts.agentPublicKey      optional
 * @param {string} opts.amount              total rent in USDC (string)
 * @param {number} opts.agentFeePct         e.g. 7 for 7%
 * @param {string} opts.memo
 * @returns {object} { txHash, ledger, settledAt, splits }
 */
async function submitRentPayment({
  tenantSecretKey,
  landlordPublicKey,
  agentPublicKey,
  amount,
  agentFeePct = 0,
  memo,
}) {
  const tenantKeypair = Keypair.fromSecret(tenantSecretKey);
  const tenantAccount = await server.loadAccount(tenantKeypair.publicKey());
  const USDC = getUSDC();

  const total = parseFloat(amount);
  const agentAmount = agentPublicKey
    ? ((agentFeePct / 100) * total).toFixed(7)
    : '0';
  const landlordAmount = agentPublicKey
    ? (total - parseFloat(agentAmount)).toFixed(7)
    : total.toFixed(7);

  const builder = new TransactionBuilder(tenantAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  });

  if (memo) builder.addMemo(Memo.text(memo.slice(0, 28)));

  builder.addOperation(Operation.payment({
    destination: landlordPublicKey,
    asset: USDC,
    amount: landlordAmount,
  }));

  if (agentPublicKey && parseFloat(agentAmount) > 0) {
    builder.addOperation(Operation.payment({
      destination: agentPublicKey,
      asset: USDC,
      amount: agentAmount,
    }));
  }

  const tx = builder.setTimeout(30).build();
  tx.sign(tenantKeypair);

  const result = await server.submitTransaction(tx);

  const splits = [
    { recipient: 'landlord', amount: landlordAmount, asset: 'USDC' },
  ];
  if (agentPublicKey && parseFloat(agentAmount) > 0) {
    splits.push({ recipient: 'agent', amount: agentAmount, asset: 'USDC' });
  }

  return {
    txHash: result.hash,
    ledger: result.ledger,
    settledAt: new Date().toISOString(),
    splits,
  };
}

module.exports = { submitRentPayment };
