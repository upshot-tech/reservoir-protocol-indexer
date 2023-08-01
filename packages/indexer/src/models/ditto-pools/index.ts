import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export type DittoPool = {
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

export const saveDittoPool = async (dittoPool: DittoPool) => {
  await idb.none(
    `
      INSERT INTO ditto_pools (
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
      address: toBuffer(dittoPool.address),
      nft: toBuffer(dittoPool.nft),
      token: toBuffer(dittoPool.token),
      permitter: toBuffer(dittoPool.permitter),
      isPrivatePool: dittoPool.isPrivatePool,
      initialized: dittoPool.initialized,
      template: toBuffer(dittoPool.template),
      fee: dittoPool.fee,
      delta: dittoPool.delta,
      adminFeeRecipient: toBuffer(dittoPool.adminFeeRecipient),
    }
  );

  return dittoPool;
};

export const getDittoPool = async (address: string): Promise<DittoPool> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        ditto_pools.address,
        ditto_pools.nft,
        ditto_pools.token,
        ditto_pools.permitter,
        ditto_pools.isPrivatePool,
        ditto_pools.initialized,
        ditto_pools.template,
        ditto_pools.fee,
        ditto_pools.delta,
        ditto_pools.adminFeeRecipient
      FROM ditto_pools
      WHERE ditto_pools.nft = $/nft/
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
    adminFeeRecipient: fromBuffer(result.nft),
  };
};
