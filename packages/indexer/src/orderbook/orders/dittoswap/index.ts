import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";
import pLimit from "p-limit";

import { idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { Sources } from "@/models/sources";
import { DittoswapPoolKind } from "@/models/dittoswap-pools";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import {
  POOL_ORDERS_MAX_PRICE_POINTS_COUNT,
  DbOrder,
  OrderMetadata,
  generateSchemaHash,
} from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import * as royalties from "@/utils/royalties";
import * as dittoswap from "@/utils/dittoswap";

export type OrderInfo = {
  orderParams: Sdk.DittoSwap.Types.OrderParams;
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  txHash: string;
  txTimestamp: number;
  status: string;
  triggerKind?: "new-order" | "reprice";
};

/**
 * 
 * @param pool Create an orderId via keccak256.
 * @param tokenKind 
 * @param side 
 * @param tokenId 
 * @returns 
 */
export const getOrderId = (
  pool: string,
  side: "sell" | "buy",
  tokenId?: string
) =>
  side === "buy"
    ? // Buy orders have a single order id per pool (or per token id in the ERC1155 case)
      keccak256(["string", "address", "string"], ["dittoswap", pool, side])
    : // Sell orders have multiple order ids per pool (one for each potential token id)
      keccak256(["string", "address", "string", "uint256"], ["dittoswap", pool, side, tokenId]);

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams }: OrderInfo) => {
    try {
      const pool = await dittoswap.getPoolDetails(orderParams.pool);
      if (!pool) {
        throw new Error("Could not fetch pool details");
      }

      if (pool.token !== Sdk.Common.Addresses.Eth[config.chainId]) {
        throw new Error("Unsupported currency");
      }

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
        return;
      }


      // Force recheck at most once per hour
      const recheckCondition = orderParams.forceRecheck
        ? `AND orders.updated_at < to_timestamp(${orderParams.deadline - 3600})`
        : `AND lower(orders.valid_between) < to_timestamp(${orderParams.deadline})`;

      // TODO : use two poolContracxts: one for Pool, one for RoyaltyRouter.
      // const royaltiesContract = new Contract(
      //   pool.address,
      //   // TODO: select the dittoswap methods that need to be taken from the contract.
      //   new Interface([
      //     `
      //     function _calculateRoyalties(
      //       IDittoPool pool,
      //       uint256 salePrice
      //     ) internal view returns (address recipient, uint256 royalties)
      //     `
      //   ]),
      //   baseProvider
      // );

      

      const poolContract = new Contract(
        pool.address,
        new Interface([
          `
          function getSellNftQuote(uint256 numNfts, bytes calldata swapData_)
          external
          view
          returns (
              uint8 error,
              uint256 newBasePrice,
              uint256 newDelta,
              uint256 outputAmount,
              tuple(
                bool specificNftId,
                uint256 nftId,
                uint256 price,
                tuple(
                  uint256 lp;
                  uint256 admin;
                  uint256 protocol;
                ) fee;
              )[] memory nftCostData
          )
          `,
          `
          function getBuyNftQuote(uint256 numNfts, bytes calldata swapData_)
          external
          view
          returns (
              uint8 error,
              uint256 newBasePrice,
              uint256 newDelta,
              uint256 inputAmount,
              tuple(
                bool specificNftId,
                uint256 nftId,
                uint256 price,
                tuple(
                  uint256 lp;
                  uint256 admin;
                  uint256 protocol;
                ) fee;
              )[] memory nftCostData
          )
          `,
        ]),
        baseProvider
      );
      // TODO get the fee function too here
      // Handle: fees
        // NOTE: TBD confirm what the protocol fee will be.
        const feeBps = pool.fee; // TODO check it is stored as bps
        const feeBreakdown: {
          kind: string;
          recipient: string;
          bps: number;
        }[] = [
          {
            kind: "marketplace",
            recipient: pool.adminFeeRecipient,
            bps: pool.fee,
          },
        ];

      // Handle buy orders
      // TODO Change logic below
      try {
        

        const id = getOrderId(orderParams.pool, "buy");
        
        if (!pool.initialized)
        {
          await idb.none(
            `
              UPDATE orders SET
                fillability_status = 'cancelled',
                expiration = to_timestamp(${orderParams.deadline}),
                -- TODO should we use this? 
                -- block_number = $/blockNumber/,
                -- log_index = $/logIndex/,
                updated_at = now()
              WHERE orders.id = $/id/
                ${recheckCondition}
            `,
            { id,
              // blockNumber: orderParams.blockNumber,
              // logIndex: orderParams.logIndex, 
            }
          );
        } else {
          const tokenBalance = await baseProvider.getBalance(pool.address);

          let tmpPriceList: (BigNumber | undefined)[] = Array.from(
            { length: POOL_ORDERS_MAX_PRICE_POINTS_COUNT },
            () => undefined
          );
          await Promise.all(
            _.range(0, POOL_ORDERS_MAX_PRICE_POINTS_COUNT).map(async (index) => {
              try {
                const swapData = ''  // no defined swapData, not sure it's needed
                const result = await poolContract.getSellNFTQuote(index + 1, swapData);
                if (result.error === 0 && result.outputAmount.lte(tokenBalance)) {
                  tmpPriceList[index] = result.outputAmount;
                }
              } catch {
                // Ignore errors
              }
            })
          );

          // Stop when the first `undefined` is encountered
          const firstUndefined = tmpPriceList.findIndex((p) => p === undefined);
          if (firstUndefined !== -1) {
            tmpPriceList = tmpPriceList.slice(0, firstUndefined);
          }
          const priceList = tmpPriceList.map((p) => p!);

          const prices: BigNumber[] = [];
          for (let i = 0; i < priceList.length; i++) {
            prices.push(bn(priceList[i]).sub(i > 0 ? priceList[i - 1] : 0));
          }


          if (prices.length) {
            // Handle: prices
            const price = prices[0].toString();
            const value = prices[0]
              .sub(
                // Subtract the protocol fee from the price
                prices[0].mul(feeBps).div(10000)
              )
              .toString();

            // Handle: royalties on top
            const defaultRoyalties = await royalties.getRoyaltiesByTokenSet(
              `contract:${pool.nft}`.toLowerCase(),
              "default"
            );

            const totalBuiltInBps = 0;
            const totalDefaultBps = defaultRoyalties
              .map(({ bps }) => bps)
              .reduce((a, b) => a + b, 0);

            const missingRoyalties = [];
            let missingRoyaltyAmount = bn(0);
            if (totalBuiltInBps < totalDefaultBps) {
              const validRecipients = defaultRoyalties.filter(
                ({ bps, recipient }) => bps && recipient !== AddressZero
              );
              if (validRecipients.length) {
                const bpsDiff = totalDefaultBps - totalBuiltInBps;
                const amount = bn(price).mul(bpsDiff).div(10000);
                missingRoyaltyAmount = missingRoyaltyAmount.add(amount);

                // Split the missing royalties pro-rata across all royalty recipients
                const totalBps = _.sumBy(validRecipients, ({ bps }) => bps);
                for (const { bps, recipient } of validRecipients) {
                  // TODO: Handle lost precision (by paying it to the last or first recipient)
                  missingRoyalties.push({
                    bps: Math.floor((bpsDiff * bps) / totalBps),
                    amount: amount.mul(bps).div(totalBps).toString(),
                    recipient,
                  });
                }
              }
            }

            const normalizedValue = bn(value).sub(missingRoyaltyAmount);

            // Handle: core sdk order
            const sdkOrder: Sdk.DittoSwap.Order = new Sdk.DittoSwap.Order(config.chainId, orderParams);

            let orderResult = await idb.oneOrNone(
              `
                SELECT
                  orders.token_set_id
                FROM orders
                WHERE orders.id = $/id/
              `,
              { id }
            );
            if (orderResult && !orderResult.token_set_id) {
              // Delete the order since it is an incomplete one resulted from 'partial' insertion of
              // fill events. The issue only occurs for buy orders since sell orders are handled via
              // 'on-chain' fill events which don't insert such incomplete orders.
              await idb.none(`DELETE FROM orders WHERE orders.id = $/id/`, { id });
              orderResult = false;
            }

            if (!orderResult) {
              // Handle: token set
              const schemaHash = generateSchemaHash();
              const [{ id: tokenSetId }] = await tokenSet.contractWide.save([
                {
                  id: `contract:${pool.nft}`.toLowerCase(),
                  schemaHash,
                  contract: pool.nft,
                },
              ]);

              if (!tokenSetId) {
                throw new Error("No token set available");
              }

              // Handle: source
              const sources = await Sources.getInstance();
              const source = await sources.getOrInsert("dittoswap.xyz");

              // TODO: change into getting the fixed limit (not infinity? but sudo and nftx both have it)
              const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.deadline}))`;
              const validTo = `'Infinity'`;
              orderValues.push({
                id,
                kind: "dittoswap",
                side: "buy",
                fillability_status: "fillable",
                approval_status: "approved",
                token_set_id: tokenSetId,
                token_set_schema_hash: toBuffer(schemaHash),
                maker: toBuffer(pool.address),
                taker: toBuffer(AddressZero),
                price,
                value,
                currency: toBuffer(pool.token),
                currency_price: price,
                currency_value: value,
                needs_conversion: null,
                quantity_remaining: prices.length.toString(),
                valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
                nonce: null,
                source_id_int: source?.id,
                is_reservoir: null,
                contract: toBuffer(pool.nft),
                conduit: null,
                fee_bps: feeBps,
                fee_breakdown: feeBreakdown,
                dynamic: null,
                raw_data: sdkOrder.params,
                expiration: validTo,
                missing_royalties: missingRoyalties,
                normalized_value: normalizedValue.toString(),
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
            } else {
              await idb.none(
                `
                  UPDATE orders SET
                    fillability_status = 'fillable',
                    approval_status = 'approved',
                    price = $/price/,
                    currency_price = $/price/,
                    value = $/value/,
                    currency_value = $/value/,
                    quantity_remaining = $/quantityRemaining/,
                    -- TODO set the end time with the fixed end range
                    valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
                    expiration = 'Infinity',
                    updated_at = now(),
                    raw_data = $/rawData:json/,
                    missing_royalties = $/missingRoyalties:json/,
                    normalized_value = $/normalizedValue/,
                    currency_normalized_value = $/currencyNormalizedValue/,
                    fee_bps = $/feeBps/,
                    fee_breakdown = $/feeBreakdown:json/,
                    block_number = $/blockNumber/,
                    log_index = $/logIndex/
                  WHERE orders.id = $/id/
                  ${recheckCondition}
                `,
                {
                  id,
                  price,
                  value,
                  rawData: sdkOrder.params,
                  quantityRemaining: prices.length.toString(),
                  missingRoyalties: missingRoyalties,
                  normalizedValue: normalizedValue.toString(),
                  currencyNormalizedValue: normalizedValue.toString(),
                  feeBps,
                  feeBreakdown,
                  blockNumber: orderParams.txBlock,
                  logIndex: orderParams.logIndex,
                }
              );

              results.push({
                id,
                txHash: orderParams.txHash,
                txTimestamp: orderParams.txTimestamp,
                status: "success",
                triggerKind: "reprice",
              });
            }
          } else {
            await idb.none(
              `
                UPDATE orders SET
                  fillability_status = 'no-balance',
                  expiration = to_timestamp(${orderParams.txTimestamp}),
                  updated_at = now()
                WHERE orders.id = $/id/
                ${recheckCondition}
              `,
              { id }
            );

            results.push({
              id,
              txHash: orderParams.txHash,
              txTimestamp: orderParams.txTimestamp,
              status: "success",
              triggerKind: "reprice",
            });
          }
        }
      } catch (error) {
        logger.error(
          "orders-dittoswap-save",
          `Failed to handle buy order with params ${JSON.stringify(orderParams)}: ${error}`
        );
      }

      // TODO Handle sell orders
      try {
        
        let tmpPriceList: (BigNumber | undefined)[] = Array.from(
          { length: POOL_ORDERS_MAX_PRICE_POINTS_COUNT },
          () => undefined
        );
        await Promise.all(
          _.range(0, POOL_ORDERS_MAX_PRICE_POINTS_COUNT).map(async (index) => {
            try {
              const swapData = ''  // no defined swapData, not sure it's needed
              const result = await poolContract.getBuyNFTQuote(index + 1, , swapData);
              if (result.error === 0) {
                tmpPriceList[index] = result.inputAmount;
              }
            } catch {
              // Ignore errors
            }
          })
        );

        // Stop when the first `undefined` is encountered
        const firstUndefined = tmpPriceList.findIndex((p) => p === undefined);
        if (firstUndefined !== -1) {
          tmpPriceList = tmpPriceList.slice(0, firstUndefined);
        }
        const priceList = tmpPriceList.map((p) => p!);

        const prices: BigNumber[] = [];
        for (let i = 0; i < priceList.length; i++) {
          prices.push(
            bn(priceList[i])
              .sub(i > 0 ? priceList[i - 1] : 0)
              // Just for safety, add 1 wei
              .add(1)
          );
        }

        // Handle: prices
        const price = prices[0].toString();
        const value = prices[0].toString();
        // TODO Here nftx substract bps. 

        // Fetch all token ids owned by the pool
        const poolOwnedTokenIds = await commonHelpers.getNfts(pool.nft, pool.address);

        const limit = pLimit(50);
        await Promise.all(
          poolOwnedTokenIds.map(({ tokenId, amount }) =>
            limit(async () => {
              try {
                const id = getOrderId(orderParams.pool, "sell");

                // Handle: royalties on top
                const defaultRoyalties = await royalties.getRoyaltiesByTokenSet(
                  `token:${pool.nft}:${tokenId}`.toLowerCase(),
                  "default"
                );

                const totalBuiltInBps = 0;
                const totalDefaultBps = defaultRoyalties
                  .map(({ bps }) => bps)
                  .reduce((a, b) => a + b, 0);

                const missingRoyalties: { bps: number; amount: string; recipient: string }[] = [];
                let missingRoyaltyAmount = bn(0);
                if (totalBuiltInBps < totalDefaultBps) {
                  const validRecipients = defaultRoyalties.filter(
                    ({ bps, recipient }) => bps && recipient !== AddressZero
                  );
                  if (validRecipients.length) {
                    const bpsDiff = totalDefaultBps - totalBuiltInBps;
                    const amount = bn(price).mul(bpsDiff).div(10000);
                    missingRoyaltyAmount = missingRoyaltyAmount.add(amount);

                    // Split the missing royalties pro-rata across all royalty recipients
                    const totalBps = _.sumBy(validRecipients, ({ bps }) => bps);
                    for (const { bps, recipient } of validRecipients) {
                      // TODO: Handle lost precision (by paying it to the last or first recipient)
                      missingRoyalties.push({
                        bps: Math.floor((bpsDiff * bps) / totalBps),
                        amount: amount.mul(bps).div(totalBps).toString(),
                        recipient,
                      });
                    }
                  }
                }

                const normalizedValue = bn(value).add(missingRoyaltyAmount);

                // Handle: core sdk order
                // TODO ensure types are ok but should be normalize
                const sdkOrder: Sdk.DittoSwap.Order = new Sdk.DittoSwap.Order(config.chainId, orderParams);
                
                const orderResult = await redb.oneOrNone(
                  `
                    SELECT 1 FROM orders
                    WHERE orders.id = $/id/
                  `,
                  { id }
                );
                if (!orderResult) {
                  // Handle: token set
                  const schemaHash = generateSchemaHash();
                  const [{ id: tokenSetId }] = await tokenSet.contractWide.save([
                    {
                      id: `contract:${pool.nft}`,
                      schemaHash,
                      contract: pool.nft,
                    },
                  ]);

                  if (!tokenSetId) {
                    throw new Error("No token set available");
                  }

                  // Handle: source
                  const sources = await Sources.getInstance();
                  const source = await sources.getOrInsert("dittoswap.xyz");

                  const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.deadline}))`;
                  // TODO get validTo from contract (fixed time)
                  const validTo = `'Infinity'`;
                  orderValues.push({
                    id,
                    kind: "dittoswap",
                    side: "sell",
                    fillability_status: "fillable",
                    approval_status: "approved",
                    token_set_id: tokenSetId,
                    token_set_schema_hash: toBuffer(schemaHash),
                    maker: toBuffer(pool.address),
                    taker: toBuffer(AddressZero),
                    price,
                    value,
                    currency: toBuffer(pool.token),
                    currency_price: price,
                    currency_value: value,
                    needs_conversion: null,
                    quantity_remaining: orderParams.amount,
                    valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
                    nonce: null,
                    source_id_int: source?.id,
                    is_reservoir: null,
                    contract: toBuffer(pool.nft),
                    conduit: null,
                    fee_bps: feeBps,
                    fee_breakdown: feeBreakdown,
                    dynamic: null,
                    raw_data: sdkOrder.params,
                    expiration: validTo,
                    missing_royalties: missingRoyalties,
                    normalized_value: normalizedValue.toString(),
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
                } else {
                  await idb.none(
                    // TODO handle limited expiration , not infinity
                    `
                      UPDATE orders SET
                        fillability_status = 'fillable',
                        approval_status = 'approved',
                        price = $/price/,
                        currency_price = $/price/,
                        value = $/value/,
                        currency_value = $/value/,
                        quantity_remaining = $/amount/,
                        valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
                        expiration = 'Infinity',
                        updated_at = now(),
                        raw_data = $/rawData:json/,
                        missing_royalties = $/missingRoyalties:json/,
                        normalized_value = $/normalizedValue/,
                        currency_normalized_value = $/currencyNormalizedValue/,
                        fee_bps = $/feeBps/,
                        fee_breakdown = $/feeBreakdown:json/,
                        block_number = $/blockNumber/,
                        log_index = $/logIndex/
                      WHERE orders.id = $/id/
                      ${recheckCondition}
                    `,
                    {
                      id,
                      price,
                      value,
                      amount: orderParams.amount,
                      rawData: sdkOrder.params,
                      missingRoyalties: missingRoyalties,
                      normalizedValue: normalizedValue.toString(),
                      currencyNormalizedValue: normalizedValue.toString(),
                      feeBps,
                      feeBreakdown,
                      blockNumber: orderParams.txBlock,
                      logIndex: orderParams.logIndex,
                    }
                  );

                  results.push({
                    id,
                    txHash: orderParams.txHash,
                    txTimestamp: orderParams.txTimestamp,
                    status: "success",
                    triggerKind: "reprice",
                  });
                }
              } catch {
                // Ignore any errors
              }
            })
          )
        );
        
      } catch (error) {
        logger.error(
          "orders-dittoswap-save",
          `Failed to handle sell order with params ${JSON.stringify(orderParams)}: ${error}`
        );
      }
    } catch (error) {
      logger.error(
        "orders-dittoswap-save",
        `Failed to handle order with params ${JSON.stringify(orderParams)}: ${error}`
      );
    }
  };

  // Process all orders concurrently
  const limit = pLimit(20);
  await Promise.all(orderInfos.map((orderInfo) => limit(() => handleOrder(orderInfo))));

  logger.info("dittoswap-debug", JSON.stringify(results));

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

  await ordersUpdateById.addToQueue(
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
          } as ordersUpdateById.OrderInfo)
      )
  );

  return results;
};
