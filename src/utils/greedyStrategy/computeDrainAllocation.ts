import ENV from '@/constants/constants';
import { Allocation, EulerEarn } from '@/types/types';
import { computeGreedyReturns } from '@/utils/greedyStrategy/computeGreedyReturns';
import { Address, isAddressEqual, maxUint256 } from 'viem';

type DrainConfig = {
  sourceVault: Address;
  targetVault: Address;
  threshold: bigint;
};

const getPositive = (value: bigint) => (value > 0n ? value : 0n);

export const computeDrainAllocation = ({
  vault,
  initialAllocation,
  config,
}: {
  vault: EulerEarn;
  initialAllocation: Allocation;
  config: DrainConfig;
}) => {
  if (isAddressEqual(config.sourceVault, config.targetVault)) {
    throw new Error('Drain mode requires distinct source and target vaults');
  }

  if (!vault.strategies[config.sourceVault]) {
    throw new Error(`Drain mode source vault ${config.sourceVault} is not part of this Euler Earn vault`);
  }
  if (!vault.strategies[config.targetVault]) {
    throw new Error(`Drain mode target vault ${config.targetVault} is not part of this Euler Earn vault`);
  }

  const sourceAllocation = initialAllocation[config.sourceVault];
  const targetAllocation = initialAllocation[config.targetVault];

  if (!sourceAllocation || !targetAllocation) {
    throw new Error('Drain mode requires both source and target allocation entries');
  }

  if (sourceAllocation.newAmount <= config.threshold) {
    const untouchedReturns = computeGreedyReturns({
      vault,
      allocation: structuredClone(initialAllocation),
    });
    return {
      allocation: structuredClone(initialAllocation),
      totalReturns: untouchedReturns.totalReturns,
      details: untouchedReturns.details,
      transferred: 0n,
    };
  }

  const updatedAllocation = structuredClone(initialAllocation);
  const updatedSource = updatedAllocation[config.sourceVault];
  const updatedTarget = updatedAllocation[config.targetVault];

  const sourceDetails = vault.strategies[config.sourceVault].details;
  const targetDetails = vault.strategies[config.targetVault].details;

  const withdrawable = getPositive(
    sourceDetails.cash + updatedSource.diff < updatedSource.newAmount
      ? sourceDetails.cash + updatedSource.diff
      : updatedSource.newAmount,
  );

  const destSupplyCap = getPositive(
    targetDetails.supplyCap -
      targetDetails.totalBorrows -
      targetDetails.cash -
      updatedTarget.diff,
  );
  const destStrategyCap = getPositive(vault.strategies[config.targetVault].cap - updatedTarget.newAmount);

  let destSoftCap = maxUint256;
  const softCapConfig = ENV.SOFT_CAPS[config.targetVault];
  if (softCapConfig) {
    destSoftCap =
      updatedTarget.newAmount < softCapConfig.max
        ? softCapConfig.max - updatedTarget.newAmount
        : 0n;
  }

  const transferCap = [withdrawable, destSupplyCap, destStrategyCap, destSoftCap].reduce(
    (min, current) => (current < min ? current : min),
    maxUint256,
  );
  const ninetyNinePercent = (transferCap * 99n) / 100n;
  // leave a small reserve to avoid rounding issues on-chain
  const transferAmount = ninetyNinePercent > 0n ? ninetyNinePercent : transferCap;

  if (transferAmount === 0n) {
    const untouchedReturns = computeGreedyReturns({
      vault,
      allocation: structuredClone(initialAllocation),
    });
    return {
      allocation: structuredClone(initialAllocation),
      totalReturns: untouchedReturns.totalReturns,
      details: untouchedReturns.details,
      transferred: 0n,
    };
  }

  updatedSource.newAmount -= transferAmount;
  updatedSource.diff -= transferAmount;
  updatedTarget.newAmount += transferAmount;
  updatedTarget.diff += transferAmount;

  const { totalReturns, details } = computeGreedyReturns({
    vault,
    allocation: updatedAllocation,
  });

  return {
    allocation: updatedAllocation,
    totalReturns,
    details,
    transferred: transferAmount,
  };
};
