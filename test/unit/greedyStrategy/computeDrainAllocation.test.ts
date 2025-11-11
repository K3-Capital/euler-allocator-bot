import { protocolSchema } from '@/types/types';
import { computeDrainAllocation } from '@/utils/greedyStrategy/computeDrainAllocation';
import { describe, expect, it } from '@jest/globals';
import { Address, zeroAddress } from 'viem';

const baseStrategy = {
  symbol: 'SYM',
  protocol: protocolSchema.Enum.euler,
  borrowAPY: 0,
  supplyAPY: 0,
  rewardCampaigns: [],
  rewardAPY: 0,
  cash: 0n,
  totalBorrows: 0n,
  totalShares: 0n,
  interestFee: 0,
  supplyCap: 10_000n,
  maxWithdraw: 0n,
  irmConfig: {
    type: 'irm' as const,
    baseRate: 0n,
    kink: 0n,
    slope1: 0n,
    slope2: 0n,
  },
};

const buildVault = ({
  sourceAddress,
  targetAddress,
  sourceAllocation,
  targetAllocation,
  sourceCash,
  targetCash,
  sourceMaxWithdraw,
  targetMaxWithdraw,
}: {
  sourceAddress: Address;
  targetAddress: Address;
  sourceAllocation: bigint;
  targetAllocation: bigint;
  sourceCash: bigint;
  targetCash: bigint;
  sourceMaxWithdraw?: bigint;
  targetMaxWithdraw?: bigint;
}) => {
  return {
    strategies: {
      [sourceAddress]: {
        cap: 10_000n,
        protocol: protocolSchema.Enum.euler,
        allocation: sourceAllocation,
        details: {
          ...baseStrategy,
          vault: sourceAddress,
          cash: sourceCash,
          maxWithdraw: sourceMaxWithdraw ?? sourceCash,
          supplyCap: 20_000n,
        },
      },
      [targetAddress]: {
        cap: 10_000n,
        protocol: protocolSchema.Enum.euler,
        allocation: targetAllocation,
        details: {
          ...baseStrategy,
          vault: targetAddress,
          cash: targetCash,
          maxWithdraw: targetMaxWithdraw ?? targetCash,
          supplyCap: 20_000n,
        },
      },
    },
    assetDecimals: 6,
    initialAllocationQueue: [sourceAddress, targetAddress],
    idleVaultAddress: zeroAddress,
  };
};

const toAllocationState = (entries: Record<Address, bigint>) =>
  Object.fromEntries(
    Object.entries(entries).map(([address, value]) => [
      address,
      { oldAmount: value, newAmount: value, diff: 0n },
    ]),
  );

describe('computeDrainAllocation', () => {
  const source = '0x0000000000000000000000000000000000000001' as Address;
  const target = '0x0000000000000000000000000000000000000002' as Address;

  it('skips transfer when computed amount does not exceed threshold', () => {
    const vault = buildVault({
      sourceAddress: source,
      targetAddress: target,
      sourceAllocation: 1_000n,
      targetAllocation: 0n,
      sourceCash: 1_000n,
      targetCash: 0n,
    });
    const initialAllocation = toAllocationState({
      [source]: 1_000n,
      [target]: 0n,
    });

    const result = computeDrainAllocation({
      vault,
      initialAllocation,
      config: { sourceVault: source, targetVault: target, threshold: 1_000n },
    });

    expect(result.transferred).toBe(0n);
    expect(result.allocation[source].newAmount).toBe(1_000n);
    expect(result.allocation[target].newAmount).toBe(0n);
  });

  it('transfers when computed amount exceeds threshold', () => {
    const vault = buildVault({
      sourceAddress: source,
      targetAddress: target,
      sourceAllocation: 1_000n,
      targetAllocation: 0n,
      sourceCash: 1_000n,
      targetCash: 0n,
    });
    const initialAllocation = toAllocationState({
      [source]: 1_000n,
      [target]: 0n,
    });

    const result = computeDrainAllocation({
      vault,
      initialAllocation,
      config: { sourceVault: source, targetVault: target, threshold: 900n },
    });

    expect(result.transferred).toBe(1_000n);
    expect(result.allocation[source].newAmount).toBe(0n);
    expect(result.allocation[target].newAmount).toBe(1_000n);
  });

  it('drains the available source vault balance into target when above threshold', () => {
    const vault = buildVault({
      sourceAddress: source,
      targetAddress: target,
      sourceAllocation: 5_000n,
      targetAllocation: 0n,
      sourceCash: 5_000n,
      targetCash: 0n,
    });
    const initialAllocation = toAllocationState({
      [source]: 5_000n,
      [target]: 0n,
    });

    const result = computeDrainAllocation({
      vault,
      initialAllocation,
      config: { sourceVault: source, targetVault: target, threshold: 400n },
    });

    expect(result.transferred).toBe(5_000n);
    expect(result.allocation[source].newAmount).toBe(0n);
    expect(result.allocation[target].newAmount).toBe(5_000n);
  });

  it('respects destination capacity constraints', () => {
    const vault = buildVault({
      sourceAddress: source,
      targetAddress: target,
      sourceAllocation: 5_000n,
      targetAllocation: 9_500n,
      sourceCash: 5_000n,
      targetCash: 9_500n,
    });
    vault.strategies[target].details.supplyCap = 10_000n;

    const initialAllocation = toAllocationState({
      [source]: 5_000n,
      [target]: 9_500n,
    });

    const result = computeDrainAllocation({
      vault,
      initialAllocation,
      config: { sourceVault: source, targetVault: target, threshold: 400n },
    });

    expect(result.transferred).toBe(500n);
    expect(result.allocation[source].newAmount).toBe(4_500n);
    expect(result.allocation[target].newAmount).toBe(10_000n);
  });

  it('caps transfer by strategy maxWithdraw even if cash is higher', () => {
    const vault = buildVault({
      sourceAddress: source,
      targetAddress: target,
      sourceAllocation: 5_000n,
      targetAllocation: 0n,
      sourceCash: 5_000n,
      targetCash: 0n,
      sourceMaxWithdraw: 1_000n,
    });

    const initialAllocation = toAllocationState({
      [source]: 5_000n,
      [target]: 0n,
    });

    const result = computeDrainAllocation({
      vault,
      initialAllocation,
      config: { sourceVault: source, targetVault: target, threshold: 100n },
    });

    expect(result.transferred).toBe(1_000n);
    expect(result.allocation[source].newAmount).toBe(4_000n);
    expect(result.allocation[target].newAmount).toBe(1_000n);
  });

  it('does not transfer more than available cash in source vault', () => {
    const vault = buildVault({
      sourceAddress: source,
      targetAddress: target,
      sourceAllocation: 5_000n,
      targetAllocation: 0n,
      sourceCash: 2_000n,
      targetCash: 0n,
    });

    const initialAllocation = toAllocationState({
      [source]: 5_000n,
      [target]: 0n,
    });

    const result = computeDrainAllocation({
      vault,
      initialAllocation,
      config: { sourceVault: source, targetVault: target, threshold: 100n },
    });

    expect(result.transferred).toBe(2_000n);
    expect(result.allocation[source].newAmount).toBe(3_000n);
    expect(result.allocation[target].newAmount).toBe(2_000n);
  });
});
