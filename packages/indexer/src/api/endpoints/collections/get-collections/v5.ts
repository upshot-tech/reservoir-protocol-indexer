/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { parseEther } from "@ethersproject/units";
import { JoiPrice, getJoiPriceObject } from "@/common/joi";
import {
  buildContinuation,
  formatEth,
  fromBuffer,
  regex,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { config } from "@/config/index";
import { CollectionSets } from "@/models/collection-sets";
import { Sources } from "@/models/sources";
import { Assets } from "@/utils/assets";

const version = "v5";

export const getCollectionsV5Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 10000,
  },
  description: "Collections",
  notes: "Use this API to explore a collection’s metadata and statistics (sales, volume, etc).",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  validate: {
    query: Joi.object({
      id: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      slug: Joi.string().description(
        "Filter to a particular collection slug. Example: `boredapeyachtclub`"
      ),
      collectionsSetId: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection set. Example: `8daa732ebe5db23f267e58d52f1c9b1879279bcdf4f78b8fb563390e6946ea65`"
        ),
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community. Example: `artblocks`"),
      contract: Joi.alternatives()
        .try(
          Joi.array().items(Joi.string().lowercase().pattern(regex.address)).max(20),
          Joi.string().lowercase().pattern(regex.address)
        )
        .description(
          "Array of contracts. Max amount is 20. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      name: Joi.string()
        .lowercase()
        .description("Search for collections that match a string. Example: `bored`"),
      maxFloorAskPrice: Joi.number().description("Maximum floor price of the collection"),
      minFloorAskPrice: Joi.number().description("Minumum floor price of the collection"),
      includeTopBid: Joi.boolean()
        .default(false)
        .description("If true, top bid will be returned in the response."),
      includeAttributes: Joi.boolean()
        .when("id", {
          is: Joi.exist(),
          then: Joi.allow(),
          otherwise: Joi.when("slug", {
            is: Joi.exist(),
            then: Joi.allow(),
            otherwise: Joi.forbidden(),
          }),
        })
        .description(
          "If true, attributes will be included in the response. Must filter by `id` or `slug` to a particular collection."
        ),
      includeSalesCount: Joi.boolean()
        .when("id", {
          is: Joi.exist(),
          then: Joi.allow(),
          otherwise: Joi.when("slug", {
            is: Joi.exist(),
            then: Joi.allow(),
            otherwise: Joi.forbidden(),
          }),
        })
        .description(
          "If true, sales count (1 day, 7 day, 30 day, all time) will be included in the response. Must filter by `id` or `slug` to a particular collection."
        ),
      includeMintStages: Joi.boolean()
        .default(false)
        .description("If true, mint data for the collection will be included in the response."),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
      useNonFlaggedFloorAsk: Joi.boolean()
        .when("normalizeRoyalties", {
          is: Joi.boolean().valid(true),
          then: Joi.valid(false),
        })
        .default(false)
        .description(
          "If true, return the non flagged floor ask. Supported only when `normalizeRoyalties` is false."
        ),
      sortBy: Joi.string()
        .valid(
          "1DayVolume",
          "7DayVolume",
          "30DayVolume",
          "allTimeVolume",
          "createdAt",
          "floorAskPrice"
        )
        .default("allTimeVolume")
        .description(
          "Order the items are returned in the response. Options are `#DayVolume`, `createdAt`, or `floorAskPrice`"
        ),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(20)
        .default(20)
        .description("Amount of items returned in response. Default and max limit is 20."),
      continuation: Joi.string().description(
        "Use continuation token to request next offset of items."
      ),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Input any ERC20 address to return result in given currency"),
    }).oxor("id", "slug", "name", "collectionsSetId", "community", "contract"),
  },
  response: {
    schema: Joi.object({
      continuation: Joi.string().allow(null),
      collections: Joi.array().items(
        Joi.object({
          id: Joi.string().description("Collection id"),
          slug: Joi.string().allow("", null).description("Open Sea slug"),
          createdAt: Joi.string().description("Time when added to indexer"),
          name: Joi.string().allow("", null),
          image: Joi.string().allow("", null),
          banner: Joi.string().allow("", null),
          discordUrl: Joi.string().allow("", null),
          externalUrl: Joi.string().allow("", null),
          twitterUsername: Joi.string().allow("", null),
          openseaVerificationStatus: Joi.string().allow("", null),
          description: Joi.string().allow("", null),
          sampleImages: Joi.array().items(Joi.string().allow("", null)),
          tokenCount: Joi.string().description("Total tokens within the collection."),
          onSaleCount: Joi.string().description("Total tokens currently on sale."),
          primaryContract: Joi.string().lowercase().pattern(regex.address),
          tokenSetId: Joi.string().allow(null),
          royalties: Joi.object({
            recipient: Joi.string().allow("", null),
            breakdown: Joi.array().items(
              Joi.object({
                recipient: Joi.string().pattern(regex.address),
                bps: Joi.number(),
              })
            ),
            bps: Joi.number(),
          }).allow(null),
          allRoyalties: Joi.object().allow(null),
          lastBuy: {
            value: Joi.number().unsafe().allow(null),
            timestamp: Joi.number().allow(null),
          },
          floorAsk: {
            id: Joi.string().allow(null),
            sourceDomain: Joi.string().allow("", null),
            price: JoiPrice.allow(null),
            maker: Joi.string().lowercase().pattern(regex.address).allow(null),
            validFrom: Joi.number().unsafe().allow(null),
            validUntil: Joi.number().unsafe().allow(null),
            token: Joi.object({
              contract: Joi.string().lowercase().pattern(regex.address).allow(null),
              tokenId: Joi.string().pattern(regex.number).allow(null),
              name: Joi.string().allow(null),
              image: Joi.string().allow("", null),
            })
              .allow(null)
              .description("Lowest Ask Price."),
          },
          topBid: Joi.object({
            id: Joi.string().allow(null),
            sourceDomain: Joi.string().allow("", null),
            price: JoiPrice.allow(null),
            maker: Joi.string().lowercase().pattern(regex.address).allow(null),
            validFrom: Joi.number().unsafe().allow(null),
            validUntil: Joi.number().unsafe().allow(null),
          })
            .description("Highest current offer")
            .optional(),
          rank: Joi.object({
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
            allTime: Joi.number().unsafe().allow(null),
          }).description("Current rank based from overall volume"),
          volume: Joi.object({
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
            allTime: Joi.number().unsafe().allow(null),
          }).description("Total volume in given time period."),
          volumeChange: Joi.object({
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
          }).description(
            "Total volume change X-days vs previous X-days. (e.g. 7day [days 1-7] vs 7day prior [days 8-14])"
          ),
          floorSale: Joi.object({
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
          }).description("The floor sale from X-days ago."),
          floorSaleChange: Joi.object({
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
          }).description(
            "Floor sale change from X-days vs X-days ago. (e.g. 7day floor sale vs floor sale 14 days ago)"
          ),
          salesCount: Joi.object({
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
            allTime: Joi.number().unsafe().allow(null),
          }).description("Number of sales of X-days period"),
          collectionBidSupported: Joi.boolean().description(`true or false`),
          ownerCount: Joi.number().description("Unique number of owners."),
          attributes: Joi.array()
            .items(
              Joi.object({
                key: Joi.string().allow("", null).description("Case sensitive"),
                kind: Joi.string()
                  .allow("", null)
                  .description("`string`, `number`, `date`, or `range`"),
                count: Joi.number().allow("", null),
              })
            )
            .optional(),
          contractKind: Joi.string()
            .allow("", null)
            .description("Returns `erc721`, `erc1155`, etc."),
          mintedTimestamp: Joi.number().allow(null),
          mintStages: Joi.array().items(
            Joi.object({
              stage: Joi.string().required(),
              tokenId: Joi.string().pattern(regex.number).allow(null),
              kind: Joi.string().required(),
              price: JoiPrice.required(),
              startTime: Joi.number().allow(null),
              endTime: Joi.number().allow(null),
              maxMintsPerWallet: Joi.number().unsafe().allow(null),
            })
          ),
        })
      ),
    }).label(`getCollections${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-collections-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      // Include top bid
      let topBidSelectQuery = "";
      let topBidJoinQuery = "";
      if (query.includeTopBid) {
        topBidSelectQuery += `, u.*`;
        topBidJoinQuery = `LEFT JOIN LATERAL (
          SELECT
            token_sets.top_buy_id,
            token_sets.top_buy_maker,
            DATE_PART('epoch', LOWER(orders.valid_between)) AS top_buy_valid_from,
            COALESCE(
              NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
              0
            ) AS top_buy_valid_until,
            token_sets.last_buy_value,
            token_sets.last_buy_timestamp,
            orders.currency AS top_buy_currency,
            orders.price AS top_buy_price,
            orders.value AS top_buy_value,
            orders.currency_price AS top_buy_currency_price,
            orders.source_id_int AS top_buy_source_id_int,
            orders.currency_value AS top_buy_currency_value,
            orders.normalized_value AS top_buy_normalized_value,
            orders.currency_normalized_value AS top_buy_currency_normalized_value
          FROM token_sets
          JOIN orders ON token_sets.top_buy_id = orders.id
          WHERE token_sets.collection_id = x.id
          ORDER BY token_sets.top_buy_value DESC NULLS LAST
          LIMIT 1
        ) u ON TRUE`;
      }

      // Include attributes
      let attributesSelectQuery = "";
      let attributesJoinQuery = "";
      if (query.includeAttributes) {
        attributesSelectQuery = ", w.*";
        attributesJoinQuery = `
          LEFT JOIN LATERAL (
            SELECT
              array_agg(
                json_build_object(
                  'key', key,
                  'kind', kind,
                  'count', attribute_count,
                  'rank', rank
                )
              ) AS attributes
            FROM attribute_keys
              WHERE attribute_keys.collection_id = x.id
            GROUP BY attribute_keys.collection_id
          ) w ON TRUE
        `;
      }

      // Include mint stages
      let mintStagesSelectQuery = "";
      let mintStagesJoinQuery = "";
      if (query.includeMintStages) {
        mintStagesSelectQuery = ", v.*";
        mintStagesJoinQuery = `
          LEFT JOIN LATERAL (
            SELECT
              array_agg(
                json_build_object(
                  'stage', collection_mints.stage,
                  'tokenId', collection_mints.token_id::TEXT,
                  'kind', collection_mints.kind,
                  'currency', concat('0x', encode(collection_mints.currency, 'hex')),
                  'price', collection_mints.price::TEXT,
                  'startTime', floor(extract(epoch from collection_mints.start_time)),
                  'endTime', floor(extract(epoch from collection_mints.end_time)),
                  'maxMintsPerWallet', collection_mints.max_mints_per_wallet
                )
              ) AS mint_stages
            FROM collection_mints
            WHERE collection_mints.collection_id = x.id
              AND collection_mints.status = 'open'
          ) v ON TRUE
        `;
      }

      let saleCountSelectQuery = "";
      let saleCountJoinQuery = "";
      if (query.includeSalesCount) {
        saleCountSelectQuery = ", s.*";
        saleCountJoinQuery = `
        LEFT JOIN LATERAL (
          SELECT
            SUM(CASE
                  WHEN to_timestamp(fe.timestamp) > NOW() - INTERVAL '24 HOURS'
                  THEN 1
                  ELSE 0
                END) AS day_sale_count,
            SUM(CASE
                  WHEN to_timestamp(fe.timestamp) > NOW() - INTERVAL '7 DAYS'
                  THEN 1
                  ELSE 0
                END) AS week_sale_count,
            SUM(CASE
                  WHEN to_timestamp(fe.timestamp) > NOW() - INTERVAL '30 DAYS'
                  THEN 1
                  ELSE 0
                END) AS month_sale_count,
            COUNT(*) AS total_sale_count
          FROM fill_events_2 fe
          JOIN "tokens" "t" ON "fe"."token_id" = "t"."token_id" AND "fe"."contract" = "t"."contract"
          WHERE t.collection_id = x.id
          AND fe.is_deleted = 0
        ) s ON TRUE
      `;
      }

      let floorAskSelectQuery;

      if (query.normalizeRoyalties) {
        floorAskSelectQuery = `
            collections.normalized_floor_sell_id AS floor_sell_id,
            collections.normalized_floor_sell_value AS floor_sell_value,
            collections.normalized_floor_sell_maker AS floor_sell_maker,
            least(2147483647::NUMERIC, date_part('epoch', lower(collections.normalized_floor_sell_valid_between)))::INT AS floor_sell_valid_from,
            least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper(collections.normalized_floor_sell_valid_between)), 'Infinity'),0))::INT AS floor_sell_valid_until,
            collections.normalized_floor_sell_source_id_int AS floor_sell_source_id_int,
            `;
      } else if (query.useNonFlaggedFloorAsk) {
        floorAskSelectQuery = `
            collections.non_flagged_floor_sell_id AS floor_sell_id,
            collections.non_flagged_floor_sell_value AS floor_sell_value,
            collections.non_flagged_floor_sell_maker AS floor_sell_maker,
            least(2147483647::NUMERIC, date_part('epoch', lower(collections.non_flagged_floor_sell_valid_between)))::INT AS floor_sell_valid_from,
            least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper(collections.non_flagged_floor_sell_valid_between)), 'Infinity'),0))::INT AS floor_sell_valid_until,
            collections.non_flagged_floor_sell_source_id_int AS floor_sell_source_id_int,
            `;
      } else {
        floorAskSelectQuery = `
            collections.floor_sell_id,
            collections.floor_sell_value,
            collections.floor_sell_maker,
            least(2147483647::NUMERIC, date_part('epoch', lower(collections.floor_sell_valid_between)))::INT AS floor_sell_valid_from,
            least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper(collections.floor_sell_valid_between)), 'Infinity'),0))::INT AS floor_sell_valid_until,
            collections.floor_sell_source_id_int,
      `;
      }

      let baseQuery = `
        SELECT
          collections.id,
          collections.slug,
          collections.name,
          (collections.metadata ->> 'imageUrl')::TEXT AS "image",
          (collections.metadata ->> 'bannerImageUrl')::TEXT AS "banner",
          (collections.metadata ->> 'discordUrl')::TEXT AS "discord_url",
          (collections.metadata ->> 'description')::TEXT AS "description",
          (collections.metadata ->> 'externalUrl')::TEXT AS "external_url",
          (collections.metadata ->> 'twitterUsername')::TEXT AS "twitter_username",
          (collections.metadata ->> 'safelistRequestStatus')::TEXT AS "opensea_verification_status",
          collections.royalties,
          collections.new_royalties,
          collections.contract,
          collections.token_id_range,
          collections.token_set_id,
          collections.day1_rank,
          collections.day1_volume,
          collections.day7_rank,
          collections.day7_volume,
          collections.day30_rank,
          collections.day30_volume,
          collections.all_time_rank,
          collections.all_time_volume,
          collections.day1_volume_change,
          collections.day7_volume_change,
          collections.day30_volume_change,
          collections.day1_floor_sell_value,
          collections.day7_floor_sell_value,
          collections.day30_floor_sell_value,
          ${floorAskSelectQuery}
          collections.token_count,
          collections.owner_count,
          collections.created_at,
          collections.minted_timestamp,
          (
            SELECT
              COUNT(*)
            FROM tokens
            WHERE tokens.collection_id = collections.id
              AND tokens.floor_sell_value IS NOT NULL
          ) AS on_sale_count,
          ARRAY(
            SELECT
              tokens.image
            FROM tokens
            WHERE tokens.collection_id = collections.id
            ORDER BY rarity_rank DESC NULLS LAST
            LIMIT 4
          ) AS sample_images,
          (
            SELECT kind FROM contracts WHERE contracts.address = collections.contract
          )  as contract_kind
        FROM collections
      `;

      // Filtering

      const conditions: string[] = [];

      if (query.id) {
        conditions.push("collections.id = $/id/");
      }
      if (query.slug) {
        conditions.push("collections.slug = $/slug/");
      }
      if (query.community) {
        conditions.push("collections.community = $/community/");
      }
      if (query.collectionsSetId) {
        query.collectionsIds = await CollectionSets.getCollectionsIds(query.collectionsSetId);
        if (_.isEmpty(query.collectionsIds)) {
          throw Boom.badRequest(`No collections for collection set ${query.collectionsSetId}`);
        }

        conditions.push(`collections.id IN ($/collectionsIds:csv/)`);
      }
      if (query.contract) {
        if (!Array.isArray(query.contract)) {
          query.contract = [query.contract];
        }
        query.contract = query.contract.map((contract: string) => toBuffer(contract));
        conditions.push(`collections.contract IN ($/contract:csv/)`);
      }
      if (query.name) {
        query.name = `%${query.name}%`;
        conditions.push(`collections.name ILIKE $/name/`);
      }

      if (query.maxFloorAskPrice) {
        query.maxFloorAskPrice = parseEther(query.maxFloorAskPrice.toString()).toString();
        conditions.push(`collections.floor_sell_value <= $/maxFloorAskPrice/`);
      }

      if (query.minFloorAskPrice) {
        query.minFloorAskPrice = parseEther(query.minFloorAskPrice.toString()).toString();
        conditions.push(`collections.floor_sell_value >= $/minFloorAskPrice/`);
      }

      // Sorting and pagination

      if (query.continuation) {
        const [contParam, contId] = _.split(splitContinuation(query.continuation)[0], "_");
        query.contParam = contParam;
        query.contId = contId;
      }

      let orderBy = "";
      switch (query.sortBy) {
        case "1DayVolume": {
          if (query.continuation) {
            conditions.push(
              `(collections.day1_volume, collections.id) < ($/contParam/, $/contId/)`
            );
          }
          orderBy = ` ORDER BY collections.day1_volume DESC, collections.id DESC`;

          break;
        }

        case "7DayVolume": {
          if (query.continuation) {
            conditions.push(
              `(collections.day7_volume, collections.id) < ($/contParam/, $/contId/)`
            );
          }
          orderBy = ` ORDER BY collections.day7_volume DESC, collections.id DESC`;

          break;
        }

        case "30DayVolume": {
          if (query.continuation) {
            conditions.push(
              `(collections.day30_volume, collections.id) < ($/contParam/, $/contId/)`
            );
          }
          orderBy = ` ORDER BY collections.day30_volume DESC, collections.id DESC`;

          break;
        }

        case "createdAt": {
          if (query.continuation) {
            conditions.push(`(collections.created_at, collections.id) < ($/contParam/, $/contId/)`);
          }
          orderBy = ` ORDER BY collections.created_at DESC, collections.id DESC`;

          break;
        }

        case "floorAskPrice": {
          if (query.continuation) {
            conditions.push(
              `(collections.floor_sell_value, collections.id) > ($/contParam/, $/contId/)`
            );
          }

          orderBy = ` ORDER BY collections.floor_sell_value, collections.id`;
          break;
        }

        case "allTimeVolume":
        default: {
          if (query.continuation) {
            conditions.push(
              `(collections.all_time_volume, collections.id) < ($/contParam/, $/contId/)`
            );
          }

          orderBy = ` ORDER BY collections.all_time_volume DESC, collections.id DESC`;

          break;
        }
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      baseQuery += orderBy;
      baseQuery += ` LIMIT $/limit/`;

      baseQuery = `
        WITH x AS (${baseQuery})
        SELECT
          x.*,
          y.*
          ${attributesSelectQuery}
          ${topBidSelectQuery}
          ${saleCountSelectQuery}
          ${mintStagesSelectQuery}
        FROM x
        LEFT JOIN LATERAL (
           SELECT
             tokens.contract AS floor_sell_token_contract,
             tokens.token_id AS floor_sell_token_id,
             tokens.name AS floor_sell_token_name,
             tokens.image AS floor_sell_token_image,
             orders.currency AS floor_sell_currency,
             ${
               query.normalizeRoyalties
                 ? "orders.currency_normalized_value AS floor_sell_currency_value"
                 : "orders.currency_value AS floor_sell_currency_value"
             }
           FROM orders
           JOIN token_sets_tokens ON token_sets_tokens.token_set_id = orders.token_set_id
           JOIN tokens ON tokens.contract = token_sets_tokens.contract AND tokens.token_id = token_sets_tokens.token_id
           WHERE orders.id = x.floor_sell_id
        ) y ON TRUE
        ${attributesJoinQuery}
        ${topBidJoinQuery}
        ${saleCountJoinQuery}
        ${mintStagesJoinQuery}
      `;

      // Any further joins might not preserve sorting
      baseQuery += orderBy.replace(/collections/g, "x");

      const results = await redb.manyOrNone(baseQuery, query);

      const sources = await Sources.getInstance();
      const collections = await Promise.all(
        results.map(async (r) => {
          // Use default currencies for backwards compatibility with entries
          // that don't have the currencies cached in the tokens table
          const floorAskCurrency = r.floor_sell_currency
            ? fromBuffer(r.floor_sell_currency)
            : Sdk.Common.Addresses.Eth[config.chainId];

          const topBidCurrency = r.top_buy_currency
            ? fromBuffer(r.top_buy_currency)
            : Sdk.Common.Addresses.Weth[config.chainId];

          const sampleImages = _.filter(
            r.sample_images,
            (image) => !_.isNull(image) && _.startsWith(image, "http")
          );

          return {
            id: r.id,
            slug: r.slug,
            createdAt: new Date(r.created_at).toISOString(),
            name: r.name,
            image:
              r.image ?? (sampleImages.length ? Assets.getLocalAssetsLink(sampleImages[0]) : null),
            banner: r.banner,
            discordUrl: r.discord_url,
            externalUrl: r.external_url,
            twitterUsername: r.twitter_username,
            openseaVerificationStatus: r.opensea_verification_status,
            description: r.description,
            sampleImages: Assets.getLocalAssetsLink(sampleImages) ?? [],
            tokenCount: String(r.token_count),
            onSaleCount: String(r.on_sale_count),
            primaryContract: fromBuffer(r.contract),
            tokenSetId: r.token_set_id,
            royalties: r.royalties
              ? {
                  // Main recipient, kept for backwards-compatibility only
                  recipient: r.royalties.length ? r.royalties[0].recipient : null,
                  breakdown: r.royalties.filter((r: any) => r.bps && r.recipient),
                  bps: r.royalties
                    .map((r: any) => r.bps)
                    .reduce((a: number, b: number) => a + b, 0),
                }
              : null,
            allRoyalties: r.new_royalties ?? null,
            lastBuy: {
              value: r.last_buy_value ? formatEth(r.last_buy_value) : null,
              timestamp: r.last_buy_timestamp,
            },
            floorAsk: {
              id: r.floor_sell_id,
              sourceDomain: sources.get(r.floor_sell_source_id_int)?.domain,
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
              validFrom: r.floor_sell_valid_from,
              validUntil: r.floor_sell_value ? r.floor_sell_valid_until : null,
              token: r.floor_sell_value && {
                contract: r.floor_sell_token_contract
                  ? fromBuffer(r.floor_sell_token_contract)
                  : null,
                tokenId: r.floor_sell_token_id,
                name: r.floor_sell_token_name,
                image: Assets.getLocalAssetsLink(r.floor_sell_token_image),
              },
            },
            topBid: query.includeTopBid
              ? {
                  id: r.top_buy_id,
                  sourceDomain: r.top_buy_id ? sources.get(r.top_buy_source_id_int)?.domain : null,
                  price: r.top_buy_id
                    ? await getJoiPriceObject(
                        {
                          net: {
                            amount: query.normalizeRoyalties
                              ? r.top_buy_currency_normalized_value ?? r.top_buy_value
                              : r.top_buy_currency_value ?? r.top_buy_value,
                            nativeAmount: query.normalizeRoyalties
                              ? r.top_buy_normalized_value ?? r.top_buy_value
                              : r.top_buy_value,
                          },
                          gross: {
                            amount: r.top_buy_currency_price ?? r.top_buy_price,
                            nativeAmount: r.top_buy_price,
                          },
                        },
                        topBidCurrency,
                        query.displayCurrency
                      )
                    : null,
                  maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
                  validFrom: r.top_buy_valid_from,
                  validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
                }
              : undefined,
            rank: {
              "1day": r.day1_rank,
              "7day": r.day7_rank,
              "30day": r.day30_rank,
              allTime: r.all_time_rank,
            },
            volume: {
              "1day": r.day1_volume ? formatEth(r.day1_volume) : null,
              "7day": r.day7_volume ? formatEth(r.day7_volume) : null,
              "30day": r.day30_volume ? formatEth(r.day30_volume) : null,
              allTime: r.all_time_volume ? formatEth(r.all_time_volume) : null,
            },
            volumeChange: {
              "1day": r.day1_volume_change,
              "7day": r.day7_volume_change,
              "30day": r.day30_volume_change,
            },
            floorSale: {
              "1day": r.day1_floor_sell_value ? formatEth(r.day1_floor_sell_value) : null,
              "7day": r.day7_floor_sell_value ? formatEth(r.day7_floor_sell_value) : null,
              "30day": r.day30_floor_sell_value ? formatEth(r.day30_floor_sell_value) : null,
            },
            floorSaleChange: {
              "1day": Number(r.day1_floor_sell_value)
                ? Number(r.floor_sell_value) / Number(r.day1_floor_sell_value)
                : null,
              "7day": Number(r.day7_floor_sell_value)
                ? Number(r.floor_sell_value) / Number(r.day7_floor_sell_value)
                : null,
              "30day": Number(r.day30_floor_sell_value)
                ? Number(r.floor_sell_value) / Number(r.day30_floor_sell_value)
                : null,
            },
            salesCount: query.includeSalesCount
              ? {
                  "1day": r.day_sale_count,
                  "7day": r.week_sale_count,
                  "30day": r.month_sale_count,
                  allTime: r.total_sale_count,
                }
              : undefined,
            collectionBidSupported: Number(r.token_count) <= config.maxTokenSetSize,
            ownerCount: Number(r.owner_count),
            attributes: query.includeAttributes
              ? _.map(_.sortBy(r.attributes, ["rank", "key"]), (attribute) => ({
                  key: attribute.key,
                  kind: attribute.kind,
                  count: Number(attribute.count),
                }))
              : undefined,
            contractKind: r.contract_kind,
            mintedTimestamp: r.minted_timestamp,
            mintStages: r.mint_stages
              ? await Promise.all(
                  r.mint_stages.map(async (m: any) => ({
                    stage: m.stage,
                    tokenId: m.tokenId,
                    kind: m.kind,
                    price: await getJoiPriceObject({ gross: { amount: m.price } }, m.currency),
                    startTime: m.startTime,
                    endTime: m.endTime,
                    maxMintsPerWallet: m.maxMintsPerWallet,
                  }))
                )
              : [],
          };
        })
      );

      // Pagination

      let continuation: string | null = null;
      if (results.length >= query.limit) {
        const lastCollection = _.last(results);
        if (lastCollection) {
          switch (query.sortBy) {
            case "1DayVolume": {
              continuation = buildContinuation(
                `${lastCollection.day1_volume}_${lastCollection.id}`
              );
              break;
            }

            case "7DayVolume": {
              continuation = buildContinuation(
                `${lastCollection.day7_volume}_${lastCollection.id}`
              );
              break;
            }

            case "30DayVolume": {
              continuation = buildContinuation(
                `${lastCollection.day30_volume}_${lastCollection.id}`
              );
              break;
            }

            case "createdAt": {
              continuation = buildContinuation(
                `${new Date(lastCollection.created_at).toISOString()}_${lastCollection.id}`
              );
              break;
            }

            case "floorAskPrice": {
              continuation = buildContinuation(
                `${lastCollection.floor_sell_value}_${lastCollection.id}`
              );
              break;
            }

            case "allTimeVolume":
            default: {
              continuation = buildContinuation(
                `${lastCollection.all_time_volume}_${lastCollection.id}`
              );
              break;
            }
          }
        }
      }

      return {
        collections,
        continuation: continuation ? continuation : undefined,
      };
    } catch (error) {
      logger.error(`get-collections-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
