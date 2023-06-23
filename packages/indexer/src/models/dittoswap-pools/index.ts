import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";


export type DittoswapPool = {
  address: string;
  nft: string;
  token: string;
  permitter: string;
  isPrivatePool: boolean;
  initialized: boolean;
  template: string;
  fee: number;
  delta: number;
  adminFeeRecipient: string;
};

export const saveDittoswapPool = async (dittoswapPool: DittoswapPool) => {
  await idb.none(
    `
      INSERT INTO dittoswap_pools (
        address,
        nft,
        token,
        permitter,
        isPrivatePool,
        initialized,
        template,
        fee,
        delta,
        adminFeeRecipient
      ) VALUES (
        $/address/,
        $/nft/,
        $/token/,
        $/permitter/,
        $/isPrivatePool/,
        $/initialized/,
        $/template/,
        $/fee/,
        $/delta/,
        $/adminFeeRecipient/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      address: toBuffer(dittoswapPool.address),
      nft: toBuffer(dittoswapPool.nft),
      token: toBuffer(dittoswapPool.token),
      permitter: toBuffer(dittoswapPool.permitter),
      isPrivatePool: dittoswapPool.isPrivatePool,
      initialized: dittoswapPool.initialized,
      template: toBuffer(dittoswapPool.template),
      fee: dittoswapPool.fee,
      delta: dittoswapPool.delta,
      adminFeeRecipient: toBuffer(dittoswapPool.adminFeeRecipient)
    }
  );

  return dittoswapPool;
};

export const getDittoswapPool = async (address: string): Promise<DittoswapPool> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        dittoswap_pools.address,
        dittoswap_pools.nft,
        dittoswap_pools.token,
        dittoswap_pools.permitter,
        dittoswap_pools.isPrivatePool,
        dittoswap_pools.initialized,
        dittoswap_pools.template,
        dittoswap_pools.fee,
        dittoswap_pools.delta,
        dittoswap_pools.adminFeeRecipient
      FROM dittoswap_pools
      WHERE dittoswap_pools.nft = $/nft/
    `,
    { address: toBuffer(address) }
  );

  return {
    address: fromBuffer(result.address),
    nft: fromBuffer(result.nft),
    token: fromBuffer(result.token),
    permitter: fromBuffer(result.permitter),
    isPrivatePool: result.isPrivatePool,
    initialized: result.initialized,
    template: fromBuffer(result.template),
    fee: result.fee,
    delta: result.delta,
    adminFeeRecipient: fromBuffer(result.nft)
  };
};
