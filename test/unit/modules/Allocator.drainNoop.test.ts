import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Allocator from '@/modules/Allocator';
import { protocolSchema } from '@/types/types';
import { type Address, zeroAddress, type Hex } from 'viem';

const notifyRunMock = jest.fn();
const executeRebalanceMock = jest.fn();
const loggerInfoMock = jest.fn();

jest.mock('@/utils/notifications/sendNotifications', () => ({
  notifyRun: (...args: unknown[]) => notifyRunMock(...args),
}));

jest.mock('@/utils/common/executeRebalance', () => ({
  executeRebalance: (...args: unknown[]) => executeRebalanceMock(...args),
}));

jest.mock('@/utils/common/log', () => {
  const actual = jest.requireActual<typeof import('@/utils/common/log')>(
    '@/utils/common/log',
  );
  return {
    ...actual,
    logger: {
      info: (...args: unknown[]) => loggerInfoMock(...args),
      error: jest.fn(),
      warn: jest.fn(),
    },
  };
});

const sourceVault = '0x0000000000000000000000000000000000000001' as Address;
const targetVault = '0x0000000000000000000000000000000000000002' as Address;

const baseStrategyDetails = {
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
  supplyCap: 1_000_000n,
  irmConfig: {
    type: 'irm' as const,
    baseRate: 0n,
    kink: 0n,
    slope1: 0n,
    slope2: 0n,
  },
};

describe('Allocator drain mode', () => {
  beforeEach(() => {
    notifyRunMock.mockReset();
    executeRebalanceMock.mockReset();
    loggerInfoMock.mockReset();
  });

  it('skips notifications when no drain action is possible', async () => {
    const allocator = new Allocator({
      allocationDiffTolerance: 0,
      allocatorPrivateKey: '0x' + '0'.repeat(64) as Hex,
      cashPercentage: 0n,
      chainId: 1,
      earnVaultAddress: zeroAddress,
      evcAddress: zeroAddress,
      evkVaultLensAddress: zeroAddress,
      eulerEarnLensAddress: zeroAddress,
      strategiesOverride: undefined,
      rpcClient: {} as never,
      broadcast: false,
      optimizationMode: 'drain',
      apySpreadTolerance: 0,
      noIdleVault: true,
      drainSourceVault: sourceVault,
      drainTargetVault: targetVault,
      drainThreshold: 0n,
    });

    const allocation = {
      [sourceVault]: { oldAmount: 0n, newAmount: 0n, diff: 0n },
      [targetVault]: { oldAmount: 0n, newAmount: 0n, diff: 0n },
    };

    const returnsDetails = {
      [sourceVault]: { interestAPY: 0, rewardsAPY: 0, utilization: 0 },
      [targetVault]: { interestAPY: 0, rewardsAPY: 0, utilization: 0 },
    };

    const vault = {
      strategies: {
        [sourceVault]: {
          cap: 1_000_000n,
          protocol: protocolSchema.Enum.euler,
          allocation: 0n,
          details: {
            ...baseStrategyDetails,
            vault: sourceVault,
          },
        },
        [targetVault]: {
          cap: 1_000_000n,
          protocol: protocolSchema.Enum.euler,
          allocation: 0n,
          details: {
            ...baseStrategyDetails,
            vault: targetVault,
          },
        },
      },
      assetDecimals: 18,
      initialAllocationQueue: [sourceVault, targetVault],
      idleVaultAddress: undefined,
    };

    await allocator['finalizeAllocationRun'](
      {
        vault,
        currentAllocation: allocation,
        currentReturns: 0,
        currentReturnsDetails: returnsDetails,
        allocatableAmount: 0n,
        cashAmount: 0n,
        requiresSpreadCheck: false,
        currentSpread: undefined,
        mode: 'drain',
      },
      {
        finalAllocation: allocation,
        finalReturns: 0,
        finalReturnsDetails: returnsDetails,
        transferred: 0n,
      },
    );

    expect(loggerInfoMock).toHaveBeenCalledWith({
      message: 'drain mode: nothing to transfer; skipping rebalance and notifications',
    });
    expect(executeRebalanceMock).not.toHaveBeenCalled();
    expect(notifyRunMock).not.toHaveBeenCalled();
  });
});
