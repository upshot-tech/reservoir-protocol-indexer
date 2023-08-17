import { bn } from "@/common/utils";
import { EventData, getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
// import { getOrderId } from "@/orderbook/orders/ditto";
import { getUSDAndNativePrices } from "@/utils/prices";
import * as ditto from "@/utils/ditto";
import { logger } from "@/common/logger";
import { BaseEventParams } from "@/events-sync/parser";
import { Log } from "@ethersproject/abstract-provider";

export const handleLiquidity = async (
  type: string,
  events: EnhancedEvent[],
  onChainData: OnChainData,
  baseEventParams: BaseEventParams,
  log: Log,
  eventData: EventData
) => {
  logger.info("ditto-handlers", `base event params: ${baseEventParams}`);
  const pool = await ditto.getPoolDetails(baseEventParams.address);
  if (!pool) {
    return;
  }
  const { args } = eventData.abi.parseLog(log);
  logger.info("ditto-handlers", `logs: ${log}`);
  const tokenIds = args.tokenIds.map(String);
  const lpId = args.lpId.map(String);
  const tokenDepositAmount = String(args.tokenDepositAmount);
  const initialPositionTokenOwner = String(args.initialPositionTokenOwner);
  // const referrer = String(args.referrer) // TODO add

  // testing data:
  // const tokenIds = ["1", "2"];
  // const lpId = "2";
  // const tokenDepositAmount = "10000000000000000";
  // const initialPositionTokenOwner =
  //   "0000000000000000000000000000000000000000000000000000000000000000";

  const orderParams = {
    pool: baseEventParams.address,
    type: type,
    nftIds: tokenIds, // eventData.nftIds,
    lpIds: lpId, // eventData.lpId,
    expectedTokenAmount: tokenDepositAmount, //
    recipient: initialPositionTokenOwner, // buy = nftRecipient, sell = erc20 tokenRecipient
    swapData: "", // defaults to 0x0 (of type bytes)
    extra: {
      // Array of prices the pool will sell/buy at
      prices: [],
    },
    // tx info
    txHash: baseEventParams.txHash,
    txTimestamp: baseEventParams.timestamp,
    txBlock: baseEventParams.block,
    logIndex: baseEventParams.logIndex,
  };

  onChainData.orders.push({
    kind: "ditto",
    info: {
      orderParams: orderParams,
      metadata: {},
    },
  });
};

export const handleEvents = async (events: EnhancedEvent[], onChainData: OnChainData) => {
  /**
   * Handle on-chain events for
   * Note: pool creation happens on any event produced by a pool.
   * - buying
   * - selling
   * - adding liquidity
   * - removing liquidity
   */
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];

    switch (subKind) {
      case "ditto-pool-created": {
        // Implementation deferred: pool can be taken upon reception of a lp
        break;
      }

      case "ditto-liquidity-created": {
        const type = "liq-created";
        handleLiquidity(type, events, onChainData, baseEventParams, log, eventData);
        break;
      }
      case "ditto-liquidity-added": {
        const type = "liq-added";
        handleLiquidity(type, events, onChainData, baseEventParams, log, eventData);
        break;
      }
      case "ditto-liquidity-removed": {
        const type = "liq-removed";
        handleLiquidity(type, events, onChainData, baseEventParams, log, eventData);
        break;
      }

      case "ditto-trade-swapped-nft-for-tokens": {
        const parsedLog = eventData.abi.parseLog(log);

        const pool = await ditto.getPoolDetails(baseEventParams.address);
        if (!pool) {
          break;
        }

        // onChainData.orders.push({
        //   kind: "ditto",
        //   info: {
        //     orderParams: {
        //       pool: baseEventParams.address,
        //       deadline: baseEventParams.timestamp,
        //       txHash: baseEventParams.txHash,
        //       txTimestamp: baseEventParams.timestamp,
        //       txBlock: baseEventParams.block,
        //       logIndex: baseEventParams.logIndex,
        //     },
        //     metadata: {},
        //   },
        // });
        const tokenId = parsedLog.args.nftId;
        const price = bn(parsedLog.args.price).toString();
        const priceData = await getUSDAndNativePrices(pool.token, price, baseEventParams.timestamp);
        if (!priceData.nativePrice) break;

        const orderKind = "ditto";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );
        const orderId = "1"; // getOrderId(pool.address, "sell", tokenId);
        const taker = (await utils.fetchTransaction(baseEventParams.txHash)).from;

        onChainData.fillEventsOnChain.push({
          orderKind,
          orderSide: "sell",
          orderId,
          maker: baseEventParams.address,
          taker,
          price: priceData.nativePrice,
          currencyPrice: price,
          usdPrice: priceData.usdPrice,
          currency: pool.token,
          contract: pool.nft,
          tokenId,
          amount: "1",
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams: {
            ...baseEventParams,
            batchIndex: 1,
          },
        });

        onChainData.fillInfos.push({
          context: `ditto-${pool.nft}-${tokenId}-${baseEventParams.txHash}`,
          orderSide: "sell",
          contract: pool.nft,
          tokenId,
          amount: "1",
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker: baseEventParams.address,
          taker,
        });

        onChainData.orderInfos.push({
          context: `filled-${orderId}-${baseEventParams.txHash}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });

        break;
      }

      case "ditto-trade-swapped-tokens-for-nft": {
        const parsedLog = eventData.abi.parseLog(log);

        const pool = await ditto.getPoolDetails(baseEventParams.address);
        if (!pool) {
          break;
        }

        // onChainData.orders.push({
        //   kind: "ditto",
        //   info: {
        //     orderParams: {
        //       pool: baseEventParams.address,
        //       deadline: baseEventParams.timestamp,
        //       txHash: baseEventParams.txHash,
        //       txTimestamp: baseEventParams.timestamp,
        //       txBlock: baseEventParams.block,
        //       logIndex: baseEventParams.logIndex,
        //     },
        //     metadata: {},
        //   },
        // });
        const tokenId = parsedLog.args.nftId;
        const price = bn(parsedLog.args.price).toString();
        const priceData = await getUSDAndNativePrices(pool.token, price, baseEventParams.timestamp);
        if (!priceData.nativePrice) break;

        const orderKind = "ditto";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );
        const orderId = "1"; // getOrderId(pool.address, "buy");
        const taker = (await utils.fetchTransaction(baseEventParams.txHash)).from;

        onChainData.fillEventsOnChain.push({
          orderKind,
          orderSide: "buy",
          orderId,
          maker: baseEventParams.address,
          taker,
          price: priceData.nativePrice,
          currencyPrice: price,
          usdPrice: priceData.usdPrice,
          currency: pool.token,
          contract: pool.nft,
          tokenId,
          amount: "1",
          orderSourceId: attributionData.orderSource?.id,
          aggregatorSourceId: attributionData.aggregatorSource?.id,
          fillSourceId: attributionData.fillSource?.id,
          baseEventParams: {
            ...baseEventParams,
            batchIndex: 1,
          },
        });

        onChainData.fillInfos.push({
          context: `ditto-${pool.nft}-${tokenId}-${baseEventParams.txHash}`,
          orderSide: "buy",
          contract: pool.nft,
          tokenId,
          amount: "1",
          price: priceData.nativePrice,
          timestamp: baseEventParams.timestamp,
          maker: baseEventParams.address,
          taker,
        });

        onChainData.orderInfos.push({
          context: `filled-${orderId}-${baseEventParams.txHash}`,
          id: orderId,
          trigger: {
            kind: "sale",
            txHash: baseEventParams.txHash,
            txTimestamp: baseEventParams.timestamp,
          },
        });
        break;
      }

      default:
        break;
    }
  }
};
