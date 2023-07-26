/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import {
  buildContinuation,
  formatEth,
  fromBuffer,
  regex,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { CollectionSets } from "@/models/collection-sets";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import {
  getJoiPriceObject,
  getJoiSaleObject,
  JoiAttributeValue,
  JoiPrice,
  JoiSale,
} from "@/common/joi";
import { Sources } from "@/models/sources";
import _ from "lodash";
import { Assets, ImageSize } from "@/utils/assets";

const version = "v7";

export const getUserTokensV7Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60000,
  },
  description: "User Tokens",
  notes:
    "Get tokens held by a user, along with ownership information such as associated orders and date acquired.",
  tags: ["api", "Tokens"],
  plugins: {
    "hapi-swagger": {
      order: 9,
    },
  },
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .required()
        .description(
          "Filter to a particular user. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
    }),
    query: Joi.object({
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community, e.g. `artblocks`"),
      collectionsSetId: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection set. Example: `8daa732ebe5db23f267e58d52f1c9b1879279bcdf4f78b8fb563390e6946ea65`"
        ),
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      contract: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Filter to a particular contract, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      tokens: Joi.alternatives().try(
        Joi.array()
          .max(50)
          .items(Joi.string().lowercase().pattern(regex.token))
          .description(
            "Array of tokens. Max limit is 50. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          ),
        Joi.string()
          .lowercase()
          .pattern(regex.token)
          .description(
            "Array of tokens. Max limit is 50. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          )
      ),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
      sortBy: Joi.string()
        .valid("acquiredAt", "lastAppraisalValue")
        .default("acquiredAt")
        .description(
          "Order the items are returned in the response. Options are `acquiredAt` and `lastAppraisalValue`."
        ),
      sortDirection: Joi.string()
        .lowercase()
        .valid("asc", "desc")
        .default("desc")
        .description("Order the items are returned in the response."),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(200)
        .default(20)
        .description("Amount of items returned in response. Max limit is 200."),
      includeTopBid: Joi.boolean()
        .default(false)
        .description("If true, top bid will be returned in the response."),
      includeAttributes: Joi.boolean()
        .default(false)
        .description("If true, attributes will be returned in the response."),
      includeLastSale: Joi.boolean()
        .default(false)
        .description(
          "If true, last sale data including royalties paid will be returned in the response."
        ),
      includeRawData: Joi.boolean()
        .default(false)
        .description("If true, raw data is included in the response."),
      useNonFlaggedFloorAsk: Joi.boolean()
        .default(false)
        .description("If true, will return the collection non flagged floor ask."),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Input any ERC20 address to return result in given currency"),
    }),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string(),
            tokenId: Joi.string(),
            kind: Joi.string().description("Can be erc721, erc115, etc."),
            name: Joi.string().allow("", null),
            image: Joi.string().allow("", null),
            imageSmall: Joi.string().allow("", null),
            imageLarge: Joi.string().allow("", null),
            metadata: Joi.object().allow(null),
            supply: Joi.number()
              .unsafe()
              .allow(null)
              .description("Can be higher than one if erc1155."),
            remainingSupply: Joi.number().unsafe().allow(null),
            rarityScore: Joi.number()
              .allow(null)
              .description("No rarity for collections over 100k"),
            rarityRank: Joi.number()
              .allow(null)
              .description("No rarity rank for collections over 100k"),
            media: Joi.string().allow(null),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow("", null),
              imageUrl: Joi.string().allow(null),
              openseaVerificationStatus: Joi.string().allow("", null),
              floorAskPrice: JoiPrice.allow(null).description("Can be null if no active asks."),
              royaltiesBps: Joi.number().allow(null),
              royalties: Joi.array()
                .items(
                  Joi.object({
                    bps: Joi.number().allow(null),
                    recipient: Joi.string().allow(null),
                  })
                )
                .allow(null),
            }),
            lastSale: JoiSale.optional(),
            topBid: Joi.object({
              id: Joi.string().allow(null),
              price: JoiPrice.allow(null),
              source: Joi.object().allow(null),
            })
              .optional()
              .description("Can be null if not active bids."),
            lastAppraisalValue: Joi.number().unsafe().allow(null).description("Can be null."),
            attributes: Joi.array()
              .items(
                Joi.object({
                  key: Joi.string().description("Case sensitive"),
                  kind: Joi.string().description("Can be `string`, `number, `date, or `range`."),
                  value: JoiAttributeValue.description("Case sensitive."),
                  tokenCount: Joi.number(),
                  onSaleCount: Joi.number(),
                  floorAskPrice: Joi.number().unsafe().allow(null).description("Can be null."),
                  topBidValue: Joi.number().unsafe().allow(null).description("Can be null."),
                  createdAt: Joi.string(),
                })
              )
              .optional(),
          }),
          ownership: Joi.object({
            tokenCount: Joi.string(),
            onSaleCount: Joi.string(),
            floorAsk: Joi.object({
              id: Joi.string().allow(null),
              price: JoiPrice.allow(null),
              maker: Joi.string().lowercase().pattern(regex.address).allow(null),
              kind: Joi.string().allow(null),
              validFrom: Joi.number().unsafe().allow(null),
              validUntil: Joi.number().unsafe().allow(null),
              source: Joi.object().allow(null),
              rawData: Joi.object().optional().allow(null),
              isNativeOffChainCancellable: Joi.boolean().optional(),
            }).description("Can be null if no asks."),
            acquiredAt: Joi.string().allow(null),
          }),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getUserTokens${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-user-tokens-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    // Filters
    (params as any).user = toBuffer(params.user);

    const tokensCollectionFilters: string[] = [];
    const nftBalanceCollectionFilters: string[] = [];

    const addCollectionToFilter = (id: string) => {
      const i = nftBalanceCollectionFilters.length;

      if (id.match(/^0x[a-f0-9]{40}:\d+:\d+$/g)) {
        // Range based collection
        const [contract, startTokenId, endTokenId] = id.split(":");

        (query as any)[`contract${i}`] = toBuffer(contract);
        (query as any)[`startTokenId${i}`] = startTokenId;
        (query as any)[`endTokenId${i}`] = endTokenId;

        nftBalanceCollectionFilters.push(`
          (nft_balances.contract = $/contract${i}/
          AND nft_balances.token_id >= $/startTokenId${i}/
          AND nft_balances.token_id <= $/endTokenId${i}/)
        `);
      } else if (id.match(/^0x[a-f0-9]{40}:[a-zA-Z]+-.+$/g)) {
        const collectionParts = id.split(":");

        (query as any)[`collection${i}`] = id;
        (query as any)[`contract${i}`] = toBuffer(collectionParts[0]);

        // List based collections
        tokensCollectionFilters.push(`
          collection_id = $/collection${i}/
        `);

        nftBalanceCollectionFilters.push(`(nft_balances.contract = $/contract${i}/)`);
      } else {
        // Contract side collection
        (query as any)[`contract${i}`] = toBuffer(id);
        (query as any)[`collection${i}`] = id;

        nftBalanceCollectionFilters.push(`(nft_balances.contract = $/contract${i}/)`);

        tokensCollectionFilters.push(`
          collection_id = $/collection${i}/
        `);
      }
    };

    if (query.community) {
      await redb
        .manyOrNone(
          `
          SELECT collections.contract
          FROM collections
          WHERE collections.community = $/community/
        `,
          { community: query.community }
        )
        .then((result) =>
          result.forEach(({ contract }) => addCollectionToFilter(fromBuffer(contract)))
        );

      if (!nftBalanceCollectionFilters.length) {
        return { tokens: [] };
      }
    }

    if (query.collectionsSetId) {
      await CollectionSets.getCollectionsIds(query.collectionsSetId).then((result) =>
        result.forEach(addCollectionToFilter)
      );

      if (!nftBalanceCollectionFilters.length) {
        return { tokens: [] };
      }
    }

    if (query.collection) {
      addCollectionToFilter(query.collection);
    }

    if (query.contract) {
      (query as any)[`contract`] = toBuffer(query.contract);
      nftBalanceCollectionFilters.push(`(nft_balances.contract = $/contract/)`);
    }

    const tokensFilter: string[] = [];

    if (query.tokens) {
      if (!_.isArray(query.tokens)) {
        query.tokens = [query.tokens];
      }

      for (const token of query.tokens) {
        const [contract, tokenId] = token.split(":");
        const tokenFilter = `('${_.replace(contract, "0x", "\\x")}', '${tokenId}')`;

        tokensFilter.push(tokenFilter);
      }

      (query as any).tokensFilter = _.join(tokensFilter, ",");
    }

    let selectFloorData;

    if (query.normalizeRoyalties) {
      selectFloorData = `
      t.normalized_floor_sell_id AS floor_sell_id,
      t.normalized_floor_sell_maker AS floor_sell_maker,
      t.normalized_floor_sell_valid_from AS floor_sell_valid_from,
      t.normalized_floor_sell_valid_to AS floor_sell_valid_to,
      t.normalized_floor_sell_source_id_int AS floor_sell_source_id_int,
      t.normalized_floor_sell_value AS floor_sell_value,
      t.normalized_floor_sell_currency AS floor_sell_currency,
      t.normalized_floor_sell_currency_value AS floor_sell_currency_value
    `;
    } else {
      selectFloorData = `
      t.floor_sell_id,
      t.floor_sell_maker,
      t.floor_sell_valid_from,
      t.floor_sell_valid_to,
      t.floor_sell_source_id_int,
      t.floor_sell_value,
      t.floor_sell_currency,
      t.floor_sell_currency_value
    `;
    }

    let selectLastSale = "";
    let includeRoyaltyBreakdownQuery = "";
    let selectRoyaltyBreakdown = "";
    if (query.includeLastSale) {
      selectLastSale = `last_sale_timestamp, last_sale_currency, last_sale_currency_price, last_sale_price, last_sale_usd_price, last_sale_marketplace_fee_bps, last_sale_royalty_fee_bps,
      last_sale_paid_full_royalty, last_sale_royalty_fee_breakdown, last_sale_marketplace_fee_breakdown,`;
      selectRoyaltyBreakdown = ", r.*";
      includeRoyaltyBreakdownQuery = `
        LEFT JOIN LATERAL (
        SELECT
          fe.timestamp AS last_sale_timestamp,          
          fe.currency AS last_sale_currency,
          fe.currency_price AS last_sale_currency_price,            
          fe.price AS last_sale_price,    
          fe.usd_price AS last_sale_usd_price,
          fe.marketplace_fee_bps AS last_sale_marketplace_fee_bps,
          fe.royalty_fee_bps AS last_sale_royalty_fee_bps,
          fe.paid_full_royalty AS last_sale_paid_full_royalty,
          fe.royalty_fee_breakdown AS last_sale_royalty_fee_breakdown,
          fe.marketplace_fee_breakdown AS last_sale_marketplace_fee_breakdown
        FROM fill_events_2 fe
        WHERE fe.contract = t.contract AND fe.token_id = t.token_id AND fe.is_deleted = 0
        ORDER BY timestamp DESC LIMIT 1
        ) r ON TRUE
        `;
    }

    let tokensJoin = `
      JOIN LATERAL (
        SELECT 
          t.token_id,
          t.name,
          t.image,
          t.metadata,
          t.media,
          t.rarity_rank,
          t.collection_id,
          t.rarity_score,
          t.supply,
          t.remaining_supply,
          t.last_sell_value,
          t.last_buy_value,
          t.last_sell_timestamp,
          t.last_buy_timestamp,
          null AS top_bid_id,
          null AS top_bid_price,
          null AS top_bid_value,
          null AS top_bid_currency,
          null AS top_bid_currency_price,
          null AS top_bid_currency_value,
          null AS top_bid_source_id_int,
          ${selectFloorData}
          ${selectRoyaltyBreakdown}
        FROM tokens t
        ${includeRoyaltyBreakdownQuery}
        WHERE b.token_id = t.token_id
        AND b.contract = t.contract
        AND ${
          tokensCollectionFilters.length ? "(" + tokensCollectionFilters.join(" OR ") + ")" : "TRUE"
        }
      ) t ON TRUE
    `;

    if (query.includeTopBid) {
      tokensJoin = `
        JOIN LATERAL (
          SELECT 
            t.token_id,
            t.name,
            t.image,
            t.metadata,
            t.media,
            t.rarity_rank,
            t.collection_id,
            t.rarity_score,
            t.supply,
            t.remaining_supply,
            t.last_sell_value,
            t.last_buy_value,
            t.last_sell_timestamp,
            t.last_buy_timestamp,
            ${selectFloorData}
            ${selectRoyaltyBreakdown}
          FROM tokens t
          ${includeRoyaltyBreakdownQuery}
          WHERE b.token_id = t.token_id
          AND b.contract = t.contract
          AND ${
            tokensCollectionFilters.length
              ? "(" + tokensCollectionFilters.join(" OR ") + ")"
              : "TRUE"
          }
        ) t ON TRUE
        LEFT JOIN LATERAL (
          SELECT 
            o.id AS "top_bid_id",
            o.price AS "top_bid_price",
            o.value AS "top_bid_value",
            o.currency AS "top_bid_currency",
            o.currency_price AS "top_bid_currency_price",
            o.currency_value AS "top_bid_currency_value",
            o.source_id_int AS "top_bid_source_id_int"
          FROM "orders" "o"
          JOIN "token_sets_tokens" "tst"
            ON "o"."token_set_id" = "tst"."token_set_id"
          WHERE "tst"."contract" = "b"."contract"
            AND "tst"."token_id" = "b"."token_id"
            AND "o"."side" = 'buy'
            AND "o"."fillability_status" = 'fillable'
            AND "o"."approval_status" = 'approved'
            ${query.normalizeRoyalties ? " AND o.normalized_value IS NOT NULL" : ""}
            AND EXISTS(
              SELECT FROM "nft_balances" "nb"
                WHERE "nb"."contract" = "b"."contract"
                AND "nb"."token_id" = "b"."token_id"
                AND "nb"."amount" > 0
                AND "nb"."owner" != "o"."maker"
                AND (
                  "o"."taker" IS NULL
                  OR "o"."taker" = '\\x0000000000000000000000000000000000000000'
                  OR "o"."taker" = "nb"."owner"
                )
            )
          ORDER BY "o"."value" DESC
          LIMIT 1
        ) "y" ON TRUE
      `;
    }

    // Include attributes
    let selectAttributes = "";
    if (query.includeAttributes) {
      selectAttributes = `
            , (
              SELECT
                array_agg(
                  json_build_object(
                    'key', ta.key,
                    'kind', attributes.kind,
                    'value', ta.value,
                    'createdAt', ta.created_at,
                    'tokenCount', attributes.token_count,
                    'onSaleCount', attributes.on_sale_count,
                    'floorAskPrice', attributes.floor_sell_value::TEXT,
                    'topBidValue', attributes.top_buy_value::TEXT
                  )
                )
              FROM token_attributes ta
              JOIN attributes
                ON ta.attribute_id = attributes.id
              WHERE ta.contract = b.contract
                AND ta.token_id = b.token_id
                AND ta.key != ''
            ) AS attributes
          `;
    }

    try {
      let baseQuery = `
        SELECT b.contract, b.token_id, b.token_count, extract(epoch from b.acquired_at) AS acquired_at, b.last_token_appraisal_value,
               t.name, t.image, t.metadata AS token_metadata, t.media, t.rarity_rank, t.collection_id, t.floor_sell_id, t.floor_sell_value, t.floor_sell_currency, t.floor_sell_currency_value,
               t.floor_sell_maker, t.floor_sell_valid_from, t.floor_sell_valid_to, t.floor_sell_source_id_int, t.supply, t.remaining_supply,
               t.rarity_score, ${selectLastSale}
               top_bid_id, top_bid_price, top_bid_value, top_bid_currency, top_bid_currency_price, top_bid_currency_value, top_bid_source_id_int,
               o.currency AS collection_floor_sell_currency, o.currency_price AS collection_floor_sell_currency_price,
               c.name as collection_name, con.kind, c.metadata, c.royalties, (c.metadata ->> 'safelistRequestStatus')::TEXT AS "opensea_verification_status",
               c.royalties_bps, ot.kind AS floor_sell_kind,
               ${query.includeRawData ? "ot.raw_data AS floor_sell_raw_data," : ""}
               ${
                 query.useNonFlaggedFloorAsk
                   ? "c.floor_sell_value"
                   : "c.non_flagged_floor_sell_value"
               } AS "collection_floor_sell_value",
               (
                    CASE WHEN t.floor_sell_value IS NOT NULL
                    THEN 1
                    ELSE 0
                    END
               ) AS on_sale_count
               ${selectAttributes}
        FROM (
            SELECT amount AS token_count, token_id, contract, acquired_at, last_token_appraisal_value
            FROM nft_balances
            WHERE owner = $/user/
              AND ${
                nftBalanceCollectionFilters.length
                  ? "(" + nftBalanceCollectionFilters.join(" OR ") + ")"
                  : "TRUE"
              }
              AND ${
                tokensFilter.length
                  ? "(nft_balances.contract, nft_balances.token_id) IN ($/tokensFilter:raw/)"
                  : "TRUE"
              }
              AND amount > 0
          ) AS b
          ${tokensJoin}
          JOIN collections c ON c.id = t.collection_id
          LEFT JOIN orders o ON o.id = c.floor_sell_id
          LEFT JOIN orders ot ON ot.id = t.floor_sell_id
          JOIN contracts con ON b.contract = con.address
      `;

      const conditions: string[] = [];

      if (query.continuation) {
        const [acquiredAtOrLastAppraisalValue, collectionId, tokenId] = splitContinuation(
          query.continuation,
          /^[0-9]+_[A-Za-z0-9:-]+_[0-9]+$/
        );

        (query as any).acquiredAtOrLastAppraisalValue = acquiredAtOrLastAppraisalValue;
        (query as any).collectionId = collectionId;
        (query as any).tokenId = tokenId;
        query.sortDirection = query.sortDirection || "desc";
        if (query.sortBy === "acquiredAt") {
          conditions.push(
            `(acquired_at, b.token_id) ${
              query.sortDirection == "desc" ? "<" : ">"
            } (to_timestamp($/acquiredAtOrLastAppraisalValue/), $/tokenId/)`
          );
        } else {
          conditions.push(
            `(last_token_appraisal_value, b.token_id) ${
              query.sortDirection == "desc" ? "<" : ">"
            } ($/acquiredAtOrLastAppraisalValue/, $/tokenId/)`
          );
        }
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      if (query.sortBy === "acquiredAt") {
        baseQuery += `
        ORDER BY
          acquired_at ${query.sortDirection}, b.token_id ${query.sortDirection}
        LIMIT $/limit/
      `;
      } else {
        baseQuery += `
        ORDER BY
          last_token_appraisal_value ${query.sortDirection} NULLS LAST, b.token_id ${query.sortDirection}
        LIMIT $/limit/
      `;
      }

      const userTokens = await redb.manyOrNone(baseQuery, { ...query, ...params });

      let continuation = null;
      if (userTokens.length === query.limit) {
        if (query.sortBy === "acquiredAt") {
          continuation = buildContinuation(
            _.toInteger(userTokens[userTokens.length - 1].acquired_at) +
              "_" +
              userTokens[userTokens.length - 1].collection_id +
              "_" +
              userTokens[userTokens.length - 1].token_id
          );
        } else {
          continuation = buildContinuation(
            _.toInteger(userTokens[userTokens.length - 1].last_token_appraisal_value) +
              "_" +
              userTokens[userTokens.length - 1].collection_id +
              "_" +
              userTokens[userTokens.length - 1].token_id
          );
        }
      }

      const sources = await Sources.getInstance();
      const result = userTokens.map(async (r) => {
        const contract = fromBuffer(r.contract);
        const tokenId = r.token_id;

        // Use default currencies for backwards compatibility with entries
        // that don't have the currencies cached in the tokens table
        const floorAskCurrency = r.floor_sell_currency
          ? fromBuffer(r.floor_sell_currency)
          : Sdk.Common.Addresses.Eth[config.chainId];
        const topBidCurrency = r.top_bid_currency
          ? fromBuffer(r.top_bid_currency)
          : Sdk.Common.Addresses.Weth[config.chainId];
        const collectionFloorSellCurrency = r.collection_floor_sell_currency
          ? fromBuffer(r.collection_floor_sell_currency)
          : Sdk.Common.Addresses.Eth[config.chainId];
        const floorSellSource = r.floor_sell_value
          ? sources.get(Number(r.floor_sell_source_id_int), contract, tokenId)
          : undefined;
        const topBidSource = r.top_bid_source_id_int
          ? sources.get(Number(r.top_bid_source_id_int), contract, tokenId)
          : undefined;
        const acquiredTime = new Date(r.acquired_at * 1000).toISOString();
        return {
          token: {
            contract: contract,
            tokenId: tokenId,
            kind: r.kind,
            name: r.name,
            image: r.image,
            imageSmall: Assets.getResizedImageUrl(r.image, ImageSize.small),
            imageLarge: Assets.getResizedImageUrl(r.image, ImageSize.large),
            metadata: r.token_metadata?.image_original_url
              ? {
                  imageOriginal: r.token_metadata.image_original_url,
                }
              : undefined,
            rarityScore: r.rarity_score,
            rarityRank: r.rarity_rank,
            supply: !_.isNull(r.supply) ? r.supply : null,
            remainingSupply: !_.isNull(r.remaining_supply) ? r.remaining_supply : null,
            media: r.media,
            collection: {
              id: r.collection_id,
              name: r.collection_name,
              imageUrl: r.metadata?.imageUrl,
              openseaVerificationStatus: r.opensea_verification_status,
              floorAskPrice: r.collection_floor_sell_value
                ? await getJoiPriceObject(
                    {
                      gross: {
                        amount: String(
                          r.collection_floor_sell_currency_price ?? r.collection_floor_sell_value
                        ),
                        nativeAmount: String(r.collection_floor_sell_value),
                      },
                    },
                    collectionFloorSellCurrency,
                    query.displayCurrency
                  )
                : null,
              royaltiesBps: r.royalties_bps ?? 0,
              royalties: r.royalties,
            },
            lastSale:
              query.includeLastSale && r.last_sale_currency
                ? await getJoiSaleObject({
                    prices: {
                      gross: {
                        amount: r.last_sale_currency_price ?? r.last_sale_price,
                        nativeAmount: r.last_sale_price,
                        usdAmount: r.last_sale_usd_price,
                      },
                    },
                    fees: {
                      royaltyFeeBps: r.last_sale_royalty_fee_bps,
                      marketplaceFeeBps: r.last_sale_marketplace_fee_bps,
                      paidFullRoyalty: r.last_sale_paid_full_royalty,
                      royaltyFeeBreakdown: r.last_sale_royalty_fee_breakdown,
                      marketplaceFeeBreakdown: r.last_sale_marketplace_fee_breakdown,
                    },
                    currencyAddress: r.last_sale_currency,
                    timestamp: r.last_sale_timestamp,
                  })
                : undefined,
            topBid: query.includeTopBid
              ? {
                  id: r.top_bid_id,
                  price: r.top_bid_value
                    ? await getJoiPriceObject(
                        {
                          net: {
                            amount: r.top_bid_currency_value ?? r.top_bid_value,
                            nativeAmount: r.top_bid_value,
                          },
                          gross: {
                            amount: r.top_bid_currency_price ?? r.top_bid_price,
                            nativeAmount: r.top_bid_price,
                          },
                        },
                        topBidCurrency,
                        query.displayCurrency
                      )
                    : null,
                  source: {
                    id: topBidSource?.address,
                    domain: topBidSource?.domain,
                    name: topBidSource?.metadata.title || topBidSource?.name,
                    icon: topBidSource?.getIcon(),
                    url: topBidSource?.metadata.url,
                  },
                }
              : undefined,
            lastAppraisalValue: r.last_token_appraisal_value
              ? formatEth(r.last_token_appraisal_value)
              : null,
            attributes: query.includeAttributes
              ? r.attributes
                ? _.map(r.attributes, (attribute) => ({
                    key: attribute.key,
                    kind: attribute.kind,
                    value: attribute.value,
                    tokenCount: attribute.tokenCount,
                    onSaleCount: attribute.onSaleCount,
                    floorAskPrice: attribute.floorAskPrice
                      ? formatEth(attribute.floorAskPrice)
                      : attribute.floorAskPrice,
                    topBidValue: attribute.topBidValue
                      ? formatEth(attribute.topBidValue)
                      : attribute.topBidValue,
                    createdAt: new Date(attribute.createdAt).toISOString(),
                  }))
                : []
              : undefined,
          },
          ownership: {
            tokenCount: String(r.token_count),
            onSaleCount: String(r.on_sale_count),
            floorAsk: {
              id: r.floor_sell_id,
              price: r.floor_sell_id
                ? await getJoiPriceObject(
                    {
                      gross: {
                        amount: r.floor_sell_currency_value ?? r.floor_sell_value,
                        nativeAmount: r.floor_sell_value,
                      },
                    },
                    floorAskCurrency,
                    query.displayCurrency
                  )
                : null,
              maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
              kind: r.floor_sell_kind,
              validFrom: r.floor_sell_value ? r.floor_sell_valid_from : null,
              validUntil: r.floor_sell_value ? r.floor_sell_valid_to : null,
              source: {
                id: floorSellSource?.address,
                domain: floorSellSource?.domain,
                name: floorSellSource?.metadata.title || floorSellSource?.name,
                icon: floorSellSource?.getIcon(),
                url: floorSellSource?.metadata.url,
              },
              rawData: query.includeRawData ? r.floor_sell_raw_data : undefined,
              isNativeOffChainCancellable: query.includeRawData
                ? r.floor_sell_raw_data?.zone ===
                  Sdk.SeaportBase.Addresses.ReservoirCancellationZone[config.chainId]
                : undefined,
            },
            acquiredAt: acquiredTime,
          },
        };
      });

      return {
        tokens: await Promise.all(result),
        continuation,
      };
    } catch (error) {
      logger.error(`get-user-tokens-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
