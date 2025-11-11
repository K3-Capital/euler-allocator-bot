import { EvkAbi } from '@/constants/EvkAbi';
import { convertEulerSharesToAssets } from '@/utils/euler/resolveEulerUnits';
import { PublicClient, type Address } from 'viem';

/**
 * @notice Gets the token balance of an address in an Euler vault
 * @dev Reads the share balance and converts it to assets via `previewRedeem`
 * @param address The address to get the balance for
 * @param vaultAddress The address of the vault
 * @param rpcClient RPC client instance for querying on-chain data
 * @returns The token balance as a bigint in the vault's token decimals
 */
export async function getEulerBalanceOf({
  address,
  vaultAddress,
  rpcClient,
}: {
  address: Address;
  vaultAddress: Address;
  rpcClient: PublicClient;
}) {
  const shares = await rpcClient.readContract({
    address: vaultAddress,
    abi: EvkAbi,
    functionName: 'balanceOf',
    args: [address],
  });
  return convertEulerSharesToAssets({
    vaultAddress,
    shares,
    rpcClient,
  });
}
