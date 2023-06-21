import { idb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export enum DittoswapPoolKind {
  TOKEN = 0,
  NFT = 1,
  TRADE = 2,
}

export type DittoswapPool = {
  address: string;
  nft: string;
  token: string;
  bondingCurve: string;
  poolKind: DittoswapPoolKind;
  pairKind: number;
  propertyChecker: string;
  tokenId?: string;
};

export const saveDittoswapPool = async (dittoswapPool: DittoswapPool) => {
  await idb.none(
    `
      INSERT INTO dittoswap_pools (
        address,
        nft,
        token,
        bonding_curve,
        pool_kind,
        pair_kind,
        property_checker,
        token_id
      ) VALUES (
        $/address/,
        $/nft/,
        $/token/,
        $/bondingCurve/,
        $/poolKind/,
        $/pairKind/,
        $/propertyChecker/,
        $/tokenId/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      address: toBuffer(dittoswapPool.address),
      nft: toBuffer(dittoswapPool.nft),
      token: toBuffer(dittoswapPool.token),
      bondingCurve: toBuffer(dittoswapPool.bondingCurve),
      poolKind: dittoswapPool.poolKind,
      pairKind: dittoswapPool.pairKind,
      propertyChecker: toBuffer(dittoswapPool.propertyChecker),
      tokenId: dittoswapPool.tokenId,
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
        dittoswap_pools.bonding_curve,
        dittoswap_pools.pool_kind,
        dittoswap_pools.pair_kind,
        dittoswap_pools.property_checker,
        dittoswap_pools.token_id
      FROM dittoswap_pools
      WHERE dittoswap_pools.address = $/address/
    `,
    { address: toBuffer(address) }
  );

  return {
    address,
    nft: fromBuffer(result.nft),
    token: fromBuffer(result.token),
    bondingCurve: fromBuffer(result.bonding_curve),
    poolKind: result.pool_kind,
    pairKind: result.pair_kind,
    propertyChecker: fromBuffer(result.property_checker),
    tokenId: result.token_id,
  };
};
