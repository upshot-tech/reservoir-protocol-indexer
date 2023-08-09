// import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
// import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/solidity";
// import * as Sdk from "@reservoir0x/sdk";
// import _ from "lodash";
import pLimit from "p-limit";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
// import { baseProvider } from "@/common/provider";
import { bn, toBuffer } from "@/common/utils";
// import { config } from "@/config/index";
import { Sources } from "@/models/sources";
// import * as commonHelpers from "@/orderbook/orders/common/helpers";
import {
  // POOL_ORDERS_MAX_PRICE_POINTS_COUNT,
  DbOrder,
  OrderMetadata,
  // generateSchemaHash,
} from "@/orderbook/orders/utils";
// import * as tokenSet from "@/orderbook/token-sets";
// import * as royalties from "@/utils/royalties";
import * as ditto from "@/utils/ditto";

import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";
import { OrderParams } from "@reservoir0x/sdk/src/ditto";

export type OrderInfo = {
  orderParams: OrderParams;
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  txHash: string;
  txTimestamp: number;
  status: string;
  triggerKind?: "new-order" | "reprice" | "cancel";
};

/**
 *
 * @param lpId Create an orderId via keccak256.
 * @returns
 */
export const getOrderId = (lpId: string) => keccak256(["string", "string"], ["ditto", lpId]);

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams }: OrderInfo) => {
    try {
      const pool = await ditto.getPoolDetails(orderParams.pool);
      if (!pool) {
        throw new Error("Could not fetch pool details");
      }
      const nftContract = pool.nft;

      // TODO Ditto -  Our token is an address.  How to check this better.
      // const token = pool.token;
      // if (pool.token !== Sdk.Common.Addresses.Eth[config.chainId]) {
      //   throw new Error("Unsupported currency");
      // }

      // Check contract exists
      const nftResult = await idb.oneOrNone(
        `
          SELECT
            contracts.kind
          FROM contracts
          WHERE contracts.address = $/address/
        `,
        { address: toBuffer(pool.nft) }
      );
      if (!nftResult || nftResult.kind !== "erc721") {
        // For now, only ERC721 collections are supported
        logger.warn("ditto-orderbook", `Collection or token type not supported: ${nftContract}`);
        return;
      }

      //   // TODO - Ditto : needed?
      // Force recheck at most once per hour
      // const recheckCondition = orderParams.forceRecheck
      //   ? `AND orders.updated_at < to_timestamp(${orderParams.txTimestamp - 3600})`
      //   : `AND lower(orders.valid_between) < to_timestamp(${orderParams.txTimestamp})`;

      //   const poolContract = new Contract(
      //     pool.address,
      //     new Interface([
      //       `
      //       function getSellNftQuote(uint256 numNfts, bytes calldata swapData_)
      //       external
      //       view
      //       returns (
      //           uint8 error,
      //           uint256 newBasePrice,
      //           uint256 newDelta,
      //           uint256 outputAmount,
      //           tuple(
      //             bool specificNftId,
      //             uint256 nftId,
      //             uint256 price,
      //             tuple(
      //               uint256 lp;
      //               uint256 admin;
      //               uint256 protocol;
      //             ) fee;
      //           )[] memory nftCostData
      //       )
      //       `,
      //       `
      //       function getBuyNftQuote(uint256 numNfts, bytes calldata swapData_)
      //       external
      //       view
      //       returns (
      //           uint8 error,
      //           uint256 newBasePrice,
      //           uint256 newDelta,
      //           uint256 inputAmount,
      //           tuple(
      //             bool specificNftId,
      //             uint256 nftId,
      //             uint256 price,
      //             tuple(
      //               uint256 lp;
      //               uint256 admin;
      //               uint256 protocol;
      //             ) fee;
      //           )[] memory nftCostData
      //       )
      //       `,
      //     ]),
      //     baseProvider
      //   );

      const poolFeeWei: BigNumber = BigNumber.from(pool.fee);
      // Convert to BPS
      const feeBps: number = poolFeeWei.div(10 ** 14).toNumber();
      logger.info("ditto-orderbook", `FEE: ${feeBps}`);
      const feeBreakdown: {
        kind: string;
        recipient: string;
        bps: number;
      }[] = [
        {
          kind: "marketplace",
          recipient: pool.adminFeeRecipient,
          bps: feeBps, // 1 wei = 1 bps
        },
      ];

      //   // Handle (buy) orders
      try {
        const lp = orderParams.lpIds;
        const id = getOrderId(lp);

        // if (!pool.initialized) {
        //   logger.info("ditto-orderbook", "Pool not initialized, cancelling order.")
        //   await idb.none(
        //     `
        //       UPDATE orders SET
        //         fillability_status = 'cancelled',
        //         expiration = to_timestamp(${orderParams.deadline}),
        //         block_number = $/blockNumber/,
        //         log_index = $/logIndex/,
        //         updated_at = now()
        //       WHERE orders.id = $/id/
        //         ${recheckCondition}
        //     `,
        //     { id, blockNumber: orderParams.txBlock, logIndex: orderParams.logIndex }
        //   );
        // } else {
        // const tokenBalance = await baseProvider.getBalance(pool.address);

        //       let tmpPriceList: (BigNumber | undefined)[] = Array.from(
        //         { length: POOL_ORDERS_MAX_PRICE_POINTS_COUNT },
        //         () => undefined
        //       );
        //       await Promise.all(
        //         _.range(0, POOL_ORDERS_MAX_PRICE_POINTS_COUNT).map(async (index) => {
        //           try {
        //             const swapData = "0x0";
        //             const result = await poolContract.getSellNFTQuote(index + 1, swapData);
        //             if (result.error === 0 && result.outputAmount.lte(tokenBalance)) {
        //               tmpPriceList[index] = result.outputAmount;
        //             }
        //           } catch {
        //             // Ignore errors
        //           }
        //         })
        //       );

        //       // Stop when the first `undefined` is encountered
        //       const firstUndefined = tmpPriceList.findIndex((p) => p === undefined);
        //       if (firstUndefined !== -1) {
        //         tmpPriceList = tmpPriceList.slice(0, firstUndefined);
        //       }
        //       const priceList = tmpPriceList.map((p) => p!);

        //       const prices: BigNumber[] = [];
        //       for (let i = 0; i < priceList.length; i++) {
        //         prices.push(bn(priceList[i]).sub(i > 0 ? priceList[i - 1] : 0));
        //       }

        //       if (prices.length) {
        //         // Handle: prices
        //         const price = prices[0].toString();
        //         const value = prices[0]
        //           .sub(
        //             // Subtract the protocol fee from the price
        //             prices[0].mul(feeBps).div(10000)
        //           )
        //           .toString();

        //         // Handle: royalties on top
        //         const defaultRoyalties = await royalties.getRoyaltiesByTokenSet(
        //           `contract:${pool.nft}`.toLowerCase(),
        //           "default"
        //         );

        //         const totalBuiltInBps = 0;
        //         const totalDefaultBps = defaultRoyalties
        //           .map(({ bps }) => bps)
        //           .reduce((a, b) => a + b, 0);

        //         const missingRoyalties = [];
        //         let missingRoyaltyAmount = bn(0);
        //         if (totalBuiltInBps < totalDefaultBps) {
        //           const validRecipients = defaultRoyalties.filter(
        //             ({ bps, recipient }) => bps && recipient !== AddressZero
        //           );
        //           if (validRecipients.length) {
        //             const bpsDiff = totalDefaultBps - totalBuiltInBps;
        //             const amount = bn(price).mul(bpsDiff).div(10000);
        //             missingRoyaltyAmount = missingRoyaltyAmount.add(amount);

        //             // Split the missing royalties pro-rata across all royalty recipients
        //             const totalBps = _.sumBy(validRecipients, ({ bps }) => bps);
        //             for (const { bps, recipient } of validRecipients) {
        //               // TODO: Handle lost precision (by paying it to the last or first recipient)
        //               missingRoyalties.push({
        //                 bps: Math.floor((bpsDiff * bps) / totalBps),
        //                 amount: amount.mul(bps).div(totalBps).toString(),
        //                 recipient,
        //               });
        //             }
        //           }
        //         }

        //         const normalizedValue = bn(value).sub(missingRoyaltyAmount);

        //         // Handle: core sdk order
        //         const sdkOrder: Sdk.Ditto.Order = new Sdk.Ditto.Order(
        //           config.chainId, {
        //             pool: orderParams.pool,
        //             expectedTokenAmount: prices[0].toString(),
        //             swapData: "0x0",
        //             extra: {
        //               prices: prices.map(String),
        //             },
        //             txHash: "TODO",
        //             txTimestamp: 1,
        //             txBlock: 1,
        //             logIndex: 1,
        //             deadline: 1,
        //             forceRecheck: false
        //         });

        //         let orderResult = await idb.oneOrNone(
        //           `
        //             SELECT
        //               orders.token_set_id
        //             FROM orders
        //             WHERE orders.id = $/id/
        //           `,
        //           { id }
        //         );
        //         if (orderResult && !orderResult.token_set_id) {
        //           // Delete the order since it is an incomplete one resulted from 'partial' insertion of
        //           // fill events. The issue only occurs for buy orders since sell orders are handled via
        //           // 'on-chain' fill events which don't insert such incomplete orders.
        //           await idb.none(`DELETE FROM orders WHERE orders.id = $/id/`, { id });
        //           orderResult = false;
        //         }

        //         if (!orderResult) {
        //           // Handle: token set
        //           const schemaHash = generateSchemaHash();
        //           const [{ id: tokenSetId }] = await tokenSet.contractWide.save([
        //             {
        //               id: `contract:${pool.nft}`.toLowerCase(),
        //               schemaHash,
        //               contract: pool.nft,
        //             },
        //           ]);

        //           if (!tokenSetId) {
        //             throw new Error("No token set available");
        //           }

        // Handle: source
        const sources = await Sources.getInstance();
        const source = await sources.getOrInsert("dittohq.xyz");

        // Pool data
        const poolAddress = "0x000";
        const poolToken = "ETH"; // pull this from the Pool.

        const tokenSetId = "token:1234";
        // const id = "1";

        const price = orderParams.extra.prices[0];
        const value = price; // not true for sales
        const quantity_remaining = orderParams.extra.prices.length.toString(); // take it from existing vs incoming nfts
        // TODO: change into getting the fixed limit (not infinity? but sudo and nftx both have it)
        const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
        const validTo = `'Infinity'`;
        const expiration = validTo.toString();
        const poolContract = orderParams.pool; // Should this be the pool or NFT contract?
        // const feeBps = 1; // Todo get the fee bps
        // const feeBreakdown = {}; // Todo get the fee bps
        const rawData = orderParams; // Confirm this is the rawData we want to keep
        const missingRoyalties = {};
        const missingRoyaltyAmount = 0;
        const normalizedValue = bn(value).sub(missingRoyaltyAmount).toString();

        orderValues.push({
          id,
          kind: "ditto",
          side: "buy",
          fillability_status: "fillable",
          approval_status: "approved",
          token_set_id: tokenSetId,
          token_set_schema_hash: toBuffer("schemaHash"),
          maker: toBuffer(poolAddress),
          taker: toBuffer(AddressZero),
          price, // which price to take? We can put the first one, but leave the rest in rawData.
          value,
          currency: toBuffer(poolToken),
          currency_price: price,
          currency_value: value,
          needs_conversion: null,
          quantity_remaining: quantity_remaining,
          valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
          nonce: null,
          source_id_int: source?.id,
          is_reservoir: null,
          contract: toBuffer(poolContract),
          conduit: null,
          fee_bps: feeBps,
          fee_breakdown: feeBreakdown,
          dynamic: null,
          raw_data: rawData,
          expiration: expiration,
          missing_royalties: missingRoyalties,
          normalized_value: normalizedValue,
          currency_normalized_value: normalizedValue.toString(),
          block_number: orderParams.txBlock ?? null,
          log_index: orderParams.logIndex ?? null,
        });

        results.push({
          id,
          txHash: orderParams.txHash,
          txTimestamp: orderParams.txTimestamp,
          status: "success",
          triggerKind: "new-order",
        });
        //         } else {
        //           await idb.none(
        //             `
        //               UPDATE orders SET
        //                 fillability_status = 'fillable',
        //                 approval_status = 'approved',
        //                 price = $/price/,
        //                 currency_price = $/price/,
        //                 value = $/value/,
        //                 currency_value = $/value/,
        //                 quantity_remaining = $/quantityRemaining/,
        //                 valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
        //                 expiration = 'Infinity',
        //                 updated_at = now(),
        //                 raw_data = $/rawData:json/,
        //                 missing_royalties = $/missingRoyalties:json/,
        //                 normalized_value = $/normalizedValue/,
        //                 currency_normalized_value = $/currencyNormalizedValue/,
        //                 fee_bps = $/feeBps/,
        //                 fee_breakdown = $/feeBreakdown:json/,
        //                 block_number = $/blockNumber/,
        //                 log_index = $/logIndex/
        //               WHERE orders.id = $/id/
        //               ${recheckCondition}
        //             `,
        //             {
        //               id,
        //               price,
        //               value,
        //               rawData: sdkOrder.params,
        //               quantityRemaining: prices.length.toString(),
        //               missingRoyalties: missingRoyalties,
        //               normalizedValue: normalizedValue.toString(),
        //               currencyNormalizedValue: normalizedValue.toString(),
        //               fee_bps: feeBreakdown,
        //               feeBreakdown,
        //               blockNumber: orderParams.txBlock,
        //               logIndex: orderParams.logIndex,
        //             }
        //           );

        //           results.push({
        //             id,
        //             txHash: orderParams.txHash,
        //             txTimestamp: orderParams.txTimestamp,
        //             status: "success",
        //             triggerKind: "reprice",
        //           });
        //         }
        //       } else {
        //         await idb.none(
        //           `
        //             UPDATE orders SET
        //               fillability_status = 'no-balance',
        //               expiration = to_timestamp(${orderParams.txTimestamp}),
        //               block_number = $/blockNumber/,
        //               log_index = $/logIndex/,
        //               updated_at = now()
        //             WHERE orders.id = $/id/
        //             ${recheckCondition}
        //           `,
        //           { id, blockNumber: orderParams.txBlock, logIndex: orderParams.logIndex }
        //         );

        //         results.push({
        //           id,
        //           txHash: orderParams.txHash,
        //           txTimestamp: orderParams.txTimestamp,
        //           status: "success",
        //           triggerKind: "reprice",
        //         });
        //       }
        //     }
        //   } catch (error) {
        //     logger.error(
        //       "orders-ditto-save",
        //       `Failed to handle buy order with params ${JSON.stringify(orderParams)}: ${error}`
        //     );
        //   }

        //   // TODO Handle sell orders
        //   try {
        //     let tmpPriceList: (BigNumber | undefined)[] = Array.from(
        //       { length: POOL_ORDERS_MAX_PRICE_POINTS_COUNT },
        //       () => undefined
        //     );
        //     await Promise.all(
        //       _.range(0, POOL_ORDERS_MAX_PRICE_POINTS_COUNT).map(async (index) => {
        //         try {
        //           const swapData = "0x0";
        //           const result = await poolContract.getBuyNFTQuote(index + 1, _, swapData);
        //           if (result.error === 0) {
        //             tmpPriceList[index] = result.inputAmount;
        //           }
        //         } catch {
        //           // Ignore errors
        //         }
        //       })
        //     );

        //     // Stop when the first `undefined` is encountered
        //     const firstUndefined = tmpPriceList.findIndex((p) => p === undefined);
        //     if (firstUndefined !== -1) {
        //       tmpPriceList = tmpPriceList.slice(0, firstUndefined);
        //     }
        //     const priceList = tmpPriceList.map((p) => p!);

        //     const prices: BigNumber[] = [];
        //     for (let i = 0; i < priceList.length; i++) {
        //       prices.push(
        //         bn(priceList[i])
        //           .sub(i > 0 ? priceList[i - 1] : 0)
        //           // Just for safety, add 1 wei
        //           .add(1)
        //       );
        //     }

        //     // Handle: prices
        //     const price = prices[0].toString();
        //     const value = prices[0].toString();

        //     // Fetch all token ids owned by the pool
        //     const poolOwnedTokenIds = await commonHelpers.getNfts(pool.nft, pool.address);

        //     const limit = pLimit(50);
        //     await Promise.all(
        //       poolOwnedTokenIds.map(({ tokenId }) =>
        //         limit(async () => {
        //           try {
        //             const id = getOrderId(orderParams.pool, "sell", tokenId);

        //             // Handle: royalties on top
        //             const defaultRoyalties = await royalties.getRoyaltiesByTokenSet(
        //               `token:${pool.nft}:${tokenId}`.toLowerCase(),
        //               "default"
        //             );

        //             const totalBuiltInBps = 0;
        //             const totalDefaultBps = defaultRoyalties
        //               .map(({ bps }) => bps)
        //               .reduce((a, b) => a + b, 0);

        //             const missingRoyalties: { bps: number; amount: string; recipient: string }[] = [];
        //             let missingRoyaltyAmount = bn(0);
        //             if (totalBuiltInBps < totalDefaultBps) {
        //               const validRecipients = defaultRoyalties.filter(
        //                 ({ bps, recipient }) => bps && recipient !== AddressZero
        //               );
        //               if (validRecipients.length) {
        //                 const bpsDiff = totalDefaultBps - totalBuiltInBps;
        //                 const amount = bn(price).mul(bpsDiff).div(10000);
        //                 missingRoyaltyAmount = missingRoyaltyAmount.add(amount);

        //                 // Split the missing royalties pro-rata across all royalty recipients
        //                 const totalBps = _.sumBy(validRecipients, ({ bps }) => bps);
        //                 for (const { bps, recipient } of validRecipients) {
        //                   // TODO: Handle lost precision (by paying it to the last or first recipient)
        //                   missingRoyalties.push({
        //                     bps: Math.floor((bpsDiff * bps) / totalBps),
        //                     amount: amount.mul(bps).div(totalBps).toString(),
        //                     recipient,
        //                   });
        //                 }
        //               }
        //             }

        //             const normalizedValue = bn(value).add(missingRoyaltyAmount);

        //             // Handle: core sdk order
        //             const sdkOrder: Sdk.Ditto.Order = new Sdk.Ditto.Order(config.chainId, {
        //               pool: orderParams.pool,
        //               nftIds: [tokenId],
        //               expectedTokenAmount: prices[0].toString(),
        //               swapData: "0x0",
        //               extra: {
        //                 prices: prices.map(String),
        //               },
        //             });

        //             const orderResult = await redb.oneOrNone(
        //               `
        //                 SELECT 1 FROM orders
        //                 WHERE orders.id = $/id/
        //               `,
        //               { id }
        //             );
        //             if (!orderResult) {
        //               // Handle: token set
        //               const schemaHash = generateSchemaHash();
        //               const [{ id: tokenSetId }] = await tokenSet.contractWide.save([
        //                 {
        //                   id: `contract:${pool.nft}`,
        //                   schemaHash,
        //                   contract: pool.nft,
        //                 },
        //               ]);

        //               if (!tokenSetId) {
        //                 throw new Error("No token set available");
        //               }

        //               // Handle: source
        //               const sources = await Sources.getInstance();
        //               const source = await sources.getOrInsert("dittohq.xyz");

        //               const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
        //               const validTo = orderParams.deadline;
        //               orderValues.push({
        //                 id,
        //                 kind: "ditto",
        //                 side: "sell",
        //                 fillability_status: "fillable",
        //                 approval_status: "approved",
        //                 token_set_id: tokenSetId,
        //                 token_set_schema_hash: toBuffer(schemaHash),
        //                 maker: toBuffer(pool.address),
        //                 taker: toBuffer(AddressZero),
        //                 price,
        //                 value,
        //                 currency: toBuffer(pool.token),
        //                 currency_price: price,
        //                 currency_value: value,
        //                 needs_conversion: null,
        //                 quantity_remaining: "1",
        //                 valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
        //                 nonce: null,
        //                 source_id_int: source?.id,
        //                 is_reservoir: null,
        //                 contract: toBuffer(pool.nft),
        //                 conduit: null,
        //                 fee_bps: feeBps,
        //                 fee_breakdown: feeBreakdown,
        //                 dynamic: null,
        //                 raw_data: sdkOrder.params,
        //                 expiration: validTo.toString(),
        //                 missing_royalties: missingRoyalties,
        //                 normalized_value: normalizedValue.toString(),
        //                 currency_normalized_value: normalizedValue.toString(),
        //                 block_number: orderParams.txBlock ?? null,
        //                 log_index: orderParams.logIndex ?? null,
        //               });

        //               results.push({
        //                 id,
        //                 txHash: orderParams.txHash,
        //                 txTimestamp: orderParams.txTimestamp,
        //                 status: "success",
        //                 triggerKind: "new-order",
        //               });
        //             } else {
        //               await idb.none(
        //                 `
        //                   UPDATE orders SET
        //                     fillability_status = 'fillable',
        //                     approval_status = 'approved',
        //                     price = $/price/,
        //                     currency_price = $/price/,
        //                     value = $/value/,
        //                     currency_value = $/value/,
        //                     quantity_remaining = $/amount/,
        //                     valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
        //                     expiration = 'Infinity',
        //                     updated_at = now(),
        //                     raw_data = $/rawData:json/,
        //                     missing_royalties = $/missingRoyalties:json/,
        //                     normalized_value = $/normalizedValue/,
        //                     currency_normalized_value = $/currencyNormalizedValue/,
        //                     fee_bps = $/feeBps/,
        //                     fee_breakdown = $/feeBreakdown:json/,
        //                     block_number = $/blockNumber/,
        //                     log_index = $/logIndex/
        //                   WHERE orders.id = $/id/
        //                   ${recheckCondition}
        //                 `,
        //                 {
        //                   id,
        //                   price,
        //                   value,
        //                   amount: "1",
        //                   rawData: sdkOrder.params,
        //                   missingRoyalties: missingRoyalties,
        //                   normalizedValue: normalizedValue.toString(),
        //                   currencyNormalizedValue: normalizedValue.toString(),
        //                   feeBps,
        //                   feeBreakdown,
        //                   blockNumber: orderParams.txBlock,
        //                   logIndex: orderParams.logIndex,
        //                 }
        //               );

        //               results.push({
        //                 id,
        //                 txHash: orderParams.txHash,
        //                 txTimestamp: orderParams.txTimestamp,
        //                 status: "success",
        //                 triggerKind: "reprice",
        //               });
        //             }
        //           } catch {
        //             // Ignore any errors
        //           }
        //         })
        //       )
        //     );
      } catch (error) {
        logger.error(
          "orders-ditto-save",
          `Failed to handle sell order with params ${JSON.stringify(orderParams)}: ${error}`
        );
      }
    } catch (error) {
      logger.error(
        "orders-ditto-save",
        `Failed to handle order with params ${JSON.stringify(orderParams)}: ${error}`
      );
    }
  };

  // Process all orders concurrently
  logger.info("ditto-orderbook", "Before handler");
  const limit = pLimit(20);
  await Promise.all(orderInfos.map((orderInfo) => limit(() => handleOrder(orderInfo))));

  logger.info("ditto-debug", JSON.stringify(results));

  if (orderValues.length) {
    const columns = new pgp.helpers.ColumnSet(
      [
        "id",
        "kind",
        "side",
        "fillability_status",
        "approval_status",
        "token_set_id",
        "token_set_schema_hash",
        "maker",
        "taker",
        "price",
        "value",
        "currency",
        "currency_price",
        "currency_value",
        "needs_conversion",
        "quantity_remaining",
        { name: "valid_between", mod: ":raw" },
        "nonce",
        "source_id_int",
        "is_reservoir",
        "contract",
        "fee_bps",
        { name: "fee_breakdown", mod: ":json" },
        "dynamic",
        "raw_data",
        { name: "expiration", mod: ":raw" },
        { name: "missing_royalties", mod: ":json" },
        "normalized_value",
        "currency_normalized_value",
        "block_number",
        "log_index",
      ],
      {
        table: "orders",
      }
    );
    await idb.none(pgp.helpers.insert(orderValues, columns) + " ON CONFLICT DO NOTHING");
  }

  await orderUpdatesByIdJob.addToQueue(
    results
      .filter(({ status }) => status === "success")
      .map(
        ({ id, txHash, txTimestamp, triggerKind }) =>
          ({
            context: `${triggerKind}-${id}-${txHash}`,
            id,
            trigger: {
              kind: triggerKind,
              txHash: txHash,
              txTimestamp: txTimestamp,
            },
          } as OrderUpdatesByIdJobPayload)
      )
  );

  return results;
};
