import Allocator from '@/modules/Allocator';
import {
  type Allocation,
  type EulerEarn,
  type ReturnsDetails,
  type StrategyDetails,
} from '@/types/types';
import { type Address, type PublicClient } from 'viem';

const STRATEGY_A = '0x0000000000000000000000000000000000000001' as Address;
const STRATEGY_B = '0x0000000000000000000000000000000000000002' as Address;

const buildStrategyDetails = (overrides?: Partial<StrategyDetails>): StrategyDetails => ({
  vault: STRATEGY_A,
  symbol: 'sA',
  protocol: 'euler',
  borrowAPY: 0.01,
  supplyAPY: 0.02,
  rewardCampaigns: [],
  rewardAPY: 0.003,
  cash: 0n,
  totalBorrows: 0n,
  totalShares: 0n,
  interestFee: 0,
  supplyCap: 1_000_000n,
  irmConfig: { type: 'noIrm' },
  ...overrides,
});

const buildVault = (): EulerEarn => ({
  strategies: {
    [STRATEGY_A]: {
      cap: 1_000_000n,
      protocol: 'euler',
      allocation: 100n,
      details: buildStrategyDetails(),
    },
    [STRATEGY_B]: {
      cap: 1_000_000n,
      protocol: 'euler',
      allocation: 100n,
      details: buildStrategyDetails({
        vault: STRATEGY_B,
        symbol: 'sB',
      }),
    },
  },
  assetDecimals: 18,
  initialAllocationQueue: [STRATEGY_A, STRATEGY_B],
});

const buildCurrentAllocation = (): Allocation => ({
  [STRATEGY_A]: { oldAmount: 100n, newAmount: 100n, diff: 0n },
  [STRATEGY_B]: { oldAmount: 100n, newAmount: 100n, diff: 0n },
});

const buildFinalAllocation = (): Allocation => ({
  [STRATEGY_A]: { oldAmount: 100n, newAmount: 80n, diff: -20n },
  [STRATEGY_B]: { oldAmount: 100n, newAmount: 120n, diff: 20n },
});

const buildReturnsDetails = (): ReturnsDetails => ({
  [STRATEGY_A]: { interestAPY: 0.02, rewardsAPY: 0.01, utilization: 0.4 },
  [STRATEGY_B]: { interestAPY: 0.03, rewardsAPY: 0.01, utilization: 0.5 },
});

const buildAllocator = (apySpreadTolerance: number) =>
  new Allocator({
    allocationDiffTolerance: 0,
    allocatorPrivateKey: '0x1111111111111111111111111111111111111111111111111111111111111111',
    cashPercentage: 0n,
    chainId: 1,
    earnVaultAddress: '0x0000000000000000000000000000000000000003',
    evcAddress: '0x0000000000000000000000000000000000000004',
    evkVaultLensAddress: '0x0000000000000000000000000000000000000005',
    eulerEarnLensAddress: '0x0000000000000000000000000000000000000006',
    rpcClient: {} as PublicClient,
    broadcast: false,
    optimizationMode: 'equalization',
    apySpreadTolerance,
    noIdleVault: false,
  });

describe('Allocator.verifyAllocation spread tolerance', () => {
  it('executes when the spread improvement exceeds the configured tolerance', async () => {
    const allocator = buildAllocator(1);
    const result = await (allocator as any).verifyAllocation(
      buildVault(),
      buildCurrentAllocation(),
      buildFinalAllocation(),
      10,
      buildReturnsDetails(),
      10,
      buildReturnsDetails(),
      { current: 5, final: 3 },
    );
    expect(result).toBe(true);
  });

  it('aborts when the spread improvement does not exceed the configured tolerance', async () => {
    const allocator = buildAllocator(2);
    const result = await (allocator as any).verifyAllocation(
      buildVault(),
      buildCurrentAllocation(),
      buildFinalAllocation(),
      10,
      buildReturnsDetails(),
      10,
      buildReturnsDetails(),
      { current: 5, final: 3 },
    );
    expect(result).toBe(false);
  });

  it('executes with any positive spread improvement when tolerance is unset', async () => {
    const allocator = buildAllocator(0);
    const result = await (allocator as any).verifyAllocation(
      buildVault(),
      buildCurrentAllocation(),
      buildFinalAllocation(),
      10,
      buildReturnsDetails(),
      10,
      buildReturnsDetails(),
      { current: 4.2, final: 4.1 },
    );
    expect(result).toBe(true);
  });

  it('aborts when there is no spread improvement and tolerance is unset', async () => {
    const allocator = buildAllocator(0);
    const result = await (allocator as any).verifyAllocation(
      buildVault(),
      buildCurrentAllocation(),
      buildFinalAllocation(),
      10,
      buildReturnsDetails(),
      10,
      buildReturnsDetails(),
      { current: 4, final: 4 },
    );
    expect(result).toBe(false);
  });
});
