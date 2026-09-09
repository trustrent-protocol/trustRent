const { Keypair, TransactionBuilder, Operation, BASE_FEE, Memo } = require('@stellar/stellar-sdk');
const { server, networkPassphrase, getUSDC } = require('./client');

/**
 * Split an amount string into integer units (7 decimal places, Stellar's
 * maximum precision) to avoid floating-point drift.
 * @param {string} amount     e.g. "500.00"
 * @param {number} agentFeePct e.g. 7 for 7%
 * @returns {{ landlord: string, agent: string }} split amounts as strings
 */
function calculateSplits(amount, agentFeePct) {
  const totalUnits = Math.round(parseFloat(amount) * 1e7);
  const agentUnits = Math.round(totalUnits * (agentFeePct / 100));
  const landlordUnits = totalUnits - agentUnits;
  return {
    landlord: (landlordUnits / 1e7).toFixed(7),
    agent: (agentUnits / 1e7).toFixed(7),
  };
}

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

  const { landlord, agent } = calculateSplits(amount, agentFeePct);
  const agentAmount = agentPublicKey && parseFloat(agent) > 0 ? agent : '0';
  const landlordAmount = agentPublicKey ? landlord : amount;

  const builder = new TransactionBuilder(tenantAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  });

  if (memo) builder.addMemo(Memo.text(memo.slice(0, 28)));

  builder.addOperation(
    Operation.payment({
      destination: landlordPublicKey,
      asset: USDC,
      amount: landlordAmount,
    }),
  );

  if (agentAmount !== '0') {
    builder.addOperation(
      Operation.payment({
        destination: agentPublicKey,
        asset: USDC,
        amount: agentAmount,
      }),
    );
  }

  const tx = builder.setTimeout(30).build();
  tx.sign(tenantKeypair);

  const result = await server.submitTransaction(tx);

  const splits = [{ recipient: 'landlord', amount: landlordAmount, asset: 'USDC' }];
  if (agentAmount !== '0') {
    splits.push({ recipient: 'agent', amount: agentAmount, asset: 'USDC' });
  }

  return {
    txHash: result.hash,
    ledger: result.ledger,
    settledAt: new Date().toISOString(),
    splits,
  };
}

module.exports = { submitRentPayment, calculateSplits };
