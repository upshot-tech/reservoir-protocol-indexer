import { Interface } from "@ethersproject/abi";
import { EventData } from "@/events-sync/data";

/**
 * Factory events
 */

export const adminSetProtocolFee: EventData = {
  kind: "dittoswap",
  subKind: "dittoswap-admin-set-protocol-fee",
  topic: "",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolFactoryAdminSetProtocolFeeRecipient(
      address protocolFeeRecipient
    )`,
  ]),
};


export const adminSetProtocolFeeMultiplier: EventData = {
  kind: "dittoswap",
  subKind: "dittoswap-admin-set-protocol-fee-multiplier",
  topic: "",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolFactoryAdminSetProtocolFeeMultiplier(
      uint96 protocolFeeMultiplier
    )`,
  ]),
};


/**
 * Pool events
 */

export const poolinitialized: EventData = {
  kind: "dittoswap",
  subKind: "dittoswap-pool-initialized",
  topic: "0x1a09ea6cde50172776f5eec38a7369da704a85b3cfad138d4bbf52a036136f72",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolMainPoolInitialized(
      address owner,
      uint128 delta,
      uint128 spotPrice,
      uint256 fee
    );`,
  ]),
};


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
  topic: "",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolTradeSwappedTokensForNft(
      uint256 sellerLpId,
      uint256 nftId,
      uint256 price,
      (
        uint256 lp,
        uint256 admin,
        uint256 protocol
      ) fee
    );`,
  ]),
};

export const tradeSwappedNftForTokens: EventData = {
  kind: "dittoswap",
  subKind: "dittoswap-trade-swapped-nft-for-tokens",
  topic: "",
  numTopics: 1,
  abi: new Interface([
    `event DittoPoolTradeSwappedNftForTokens(
      uint256 buyerLpId,
      uint256 nftId,
      uint256 price,
      (
        uint256 lp,
        uint256 admin,
        uint256 protocol
      ) fee
    );`,
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