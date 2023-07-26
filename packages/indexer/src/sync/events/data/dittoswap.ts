import { Interface } from "@ethersproject/abi";
import { EventData } from "@/events-sync/data";

/**
 * Factory events
 */

export const poolCreated: EventData = {
  kind: "dittoswap",
  subKind: "dittoswap-pool-created",
  topic: "0x47c73863168b3080e0e387c11995820f90746ddb0d566efa696c327137a601c2",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolFactoryDittoPoolCreated((bool,uint256,address,address,uint96,address,uint96,uint128,uint128,uint256[],uint256,bytes,bytes),address,(uint256,bytes),address,(uint256,bytes,bytes),address,bool,bytes)`,
  ]),
};

/**
 * Pool events
 */

export const changeBasePrice: EventData = {
  kind: "dittoswap",
  subKind: "dittoswap-change-base-price",
  topic: "0x4b55931a4085849dfaf93c2344ab789548473ef35191fec9653cef6b4d517765",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolMainAdminChangedBasePrice(
      uint128 newBasePrice
    );`,
  ]),
};

export const changeDelta: EventData = {
  kind: "dittoswap",
  subKind: "dittoswap-change-delta",
  topic: "0x215988d2aaea1f25437c87d9b4c7b329541654de99cfdf677691951a135bfbad",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolMainAdminChangedDelta(
      uint128 newDelta
    );`,
  ]),
};

export const changeAdminFeeRecipient: EventData = {
  kind: "dittoswap",
  subKind: "dittoswap-change-admin-fee-recipient",
  topic: "",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolMainAdminChangedAdminFeeRecipient(
      address adminFeeRecipient
    );`,
  ]),
};

export const changeAdminChangedAdminFee: EventData = {
  kind: "dittoswap",
  subKind: "dittoswap-change-admin-fee",
  topic: "0xcd79476b656fecd94ac609917c143e2dbfb2f609aff4e42b07528ff31ccb3032",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolMainAdminChangedAdminFee(
      uint256 newAdminFee
    );`,
  ]),
};

export const changeAdminChangedLpFee: EventData = {
  kind: "dittoswap",
  subKind: "dittoswap-change-admin-lp-fee",
  topic: "0x50242e453835985d85a43b6291bd218321f782131b8d34e8e92ad7b243a840ce",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolMainAdminChangedLpFee(
      uint256 newLpFee
    );`,
  ]),
};

export const tradeSwappedTokensForNft: EventData = {
  kind: "dittoswap",
  subKind: "dittoswap-trade-swapped-tokens-for-nft",
  topic: "0xaf55c27589967940201b48853c5edb0b958104a4e136c7305c9ad5aaee4b1d6d",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolTradeSwappedTokensForNft(uint256,uint256,uint256,(uint256,uint256,uint256))`,
  ]),
};

export const tradeSwappedNftForTokens: EventData = {
  kind: "dittoswap",
  subKind: "dittoswap-trade-swapped-nft-for-tokens",
  topic: "0xd29a2b5a8296788ca359d8fc626bea426929592b0510cb549cd959f5943bb8d6",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolTradeSwappedNftForTokens(uint256,uint256,uint256,(uint256,uint256,uint256))`,
  ]),
};

export const liquidityAdded: EventData = {
  kind: "dittoswap",
  subKind: "dittoswap-liquidity-added",
  topic: "",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolMarketMakeLiquidityAdded(
      address liquidityProvider,
      uint256 lpId,
      uint256[] tokenIds,
      uint256 tokenDepositAmount,
      bytes referrer
    );`,
  ]),
};

export const liquidityRemoved: EventData = {
  kind: "dittoswap",
  subKind: "dittoswap-liquidity-removed",
  topic: "",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolMarketMakeLiquidityRemoved(
      uint256 lpId,
      uint256[] nftIds,
      uint256 tokenWithdrawAmount
    );`,
  ]),
};

/**
 * LPNft (index mint and burn of lp)
 * Not needed for now, since lps changes are covered by liquidityAdded/Removed events.
 */
