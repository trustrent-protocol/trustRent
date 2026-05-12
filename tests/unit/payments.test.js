/**
 * Payment splitting logic unit tests.
 * Tests the split calculation without hitting Stellar testnet.
 */

function calculateSplits(amount, agentFeePct) {
  const total = parseFloat(amount);
  const agentAmount = ((agentFeePct / 100) * total).toFixed(7);
  const landlordAmount = (total - parseFloat(agentAmount)).toFixed(7);
  return { landlordAmount, agentAmount };
}

describe('payment splitting', () => {
  test('7% agent fee on 500 USDC', () => {
    const { landlordAmount, agentAmount } = calculateSplits('500', 7);
    expect(parseFloat(landlordAmount)).toBeCloseTo(465, 2);
    expect(parseFloat(agentAmount)).toBeCloseTo(35, 2);
  });

  test('0% agent fee sends full amount to landlord', () => {
    const { landlordAmount, agentAmount } = calculateSplits('500', 0);
    expect(parseFloat(landlordAmount)).toBe(500);
    expect(parseFloat(agentAmount)).toBe(0);
  });

  test('splits sum to total', () => {
    const { landlordAmount, agentAmount } = calculateSplits('750', 10);
    const sum = parseFloat(landlordAmount) + parseFloat(agentAmount);
    expect(sum).toBeCloseTo(750, 5);
  });
});
