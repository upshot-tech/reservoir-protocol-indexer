import { bn } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";
import { getOrderId } from "@/orderbook/orders/dittoswap";
import { getUSDAndNativePrices } from "@/utils/prices";
import * as dittoswap from "@/utils/dittoswap";

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
      case "dittoswap-trade-swapped-nft-for-tokens": {
        const parsedLog = eventData.abi.parseLog(log);

        const pool = await dittoswap.getPoolDetails(baseEventParams.address);
        if (!pool) {
          break;
        }

        onChainData.orders.push({
          kind: "ditto",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              deadline: baseEventParams.timestamp,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
            },
            metadata: {},
          },
        });
        const tokenId = parsedLog.args.nftId;
        const price = bn(parsedLog.args.price).toString();
        const priceData = await getUSDAndNativePrices(pool.token, price, baseEventParams.timestamp);
        if (!priceData.nativePrice) break;

        const orderKind = "ditto";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );
        const orderId = getOrderId(pool.address, "sell", tokenId);
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
          context: `dittoswap-${pool.nft}-${tokenId}-${baseEventParams.txHash}`,
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

      case "dittoswap-trade-swapped-tokens-for-nft": {
        const parsedLog = eventData.abi.parseLog(log);

        const pool = await dittoswap.getPoolDetails(baseEventParams.address);
        if (!pool) {
          break;
        }

        onChainData.orders.push({
          kind: "ditto",
          info: {
            orderParams: {
              pool: baseEventParams.address,
              deadline: baseEventParams.timestamp,
              txHash: baseEventParams.txHash,
              txTimestamp: baseEventParams.timestamp,
              txBlock: baseEventParams.block,
              logIndex: baseEventParams.logIndex,
            },
            metadata: {},
          },
        });
        const tokenId = parsedLog.args.nftId;
        const price = bn(parsedLog.args.price).toString();
        const priceData = await getUSDAndNativePrices(pool.token, price, baseEventParams.timestamp);
        if (!priceData.nativePrice) break;

        const orderKind = "ditto";
        const attributionData = await utils.extractAttributionData(
          baseEventParams.txHash,
          orderKind
        );
        const orderId = getOrderId(pool.address, "buy");
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
          context: `dittoswap-${pool.nft}-${tokenId}-${baseEventParams.txHash}`,
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
