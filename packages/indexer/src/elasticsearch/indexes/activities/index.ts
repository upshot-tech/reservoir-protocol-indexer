/* eslint-disable @typescript-eslint/no-explicit-any */

import { elasticsearch } from "@/common/elasticsearch";

import {
  MappingTypeMapping,
  QueryDslQueryContainer,
  Sort,
} from "@elastic/elasticsearch/lib/api/types";
import { SortResults } from "@elastic/elasticsearch/lib/api/typesWithBodyKey";
import { logger } from "@/common/logger";
import { CollectionsEntity } from "@/models/collections/collections-entity";
import {
  ActivityDocument,
  ActivityType,
  CollectionAggregation,
} from "@/elasticsearch/indexes/activities/base";
import { getNetworkName, getNetworkSettings } from "@/config/network";
import _ from "lodash";
import { buildContinuation, splitContinuation } from "@/common/utils";
import { addToQueue as backfillActivitiesAddToQueue } from "@/jobs/activities/backfill/backfill-activities-elasticsearch";

const INDEX_NAME = `${getNetworkName()}.activities`;

const MAPPINGS: MappingTypeMapping = {
  dynamic: "false",
  properties: {
    id: { type: "keyword" },
    createdAt: { type: "date" },
    indexedAt: { type: "date" },
    type: { type: "keyword" },
    timestamp: { type: "float" },
    contract: { type: "keyword" },
    fromAddress: { type: "keyword" },
    toAddress: { type: "keyword" },
    amount: { type: "keyword" },
    token: {
      properties: {
        id: { type: "keyword" },
        name: { type: "keyword" },
        image: { type: "keyword" },
        media: { type: "keyword" },
      },
    },
    collection: {
      properties: {
        id: { type: "keyword" },
        name: { type: "keyword" },
        image: { type: "keyword" },
      },
    },
    order: {
      properties: {
        id: { type: "keyword" },
        side: { type: "keyword" },
        sourceId: { type: "integer" },
        criteria: {
          properties: {
            kind: { type: "keyword" },
            data: {
              properties: {
                token: {
                  properties: {
                    tokenId: { type: "keyword" },
                  },
                },
                collection: {
                  properties: {
                    id: { type: "keyword" },
                  },
                },
                attribute: {
                  properties: {
                    key: { type: "keyword" },
                    value: { type: "keyword" },
                  },
                },
              },
            },
          },
        },
      },
    },
    event: {
      properties: {
        timestamp: { type: "float" },
        txHash: { type: "keyword" },
        logIndex: { type: "integer" },
        batchIndex: { type: "integer" },
        blockHash: { type: "keyword" },
      },
    },
    pricing: {
      properties: {
        price: { type: "keyword" },
        priceDecimal: { type: "double" },
        currencyPrice: { type: "keyword" },
        usdPrice: { type: "keyword" },
        feeBps: { type: "integer" },
        currency: { type: "keyword" },
        value: { type: "keyword" },
        valueDecimal: { type: "double" },
        currencyValue: { type: "keyword" },
        normalizedValue: { type: "keyword" },
        normalizedValueDecimal: { type: "double" },
        currencyNormalizedValue: { type: "keyword" },
      },
    },
  },
};

export const save = async (activities: ActivityDocument[], upsert = true): Promise<void> => {
  try {
    const response = await elasticsearch.bulk({
      body: activities.flatMap((activity) => [
        { [upsert ? "index" : "create"]: { _index: INDEX_NAME, _id: activity.id } },
        activity,
      ]),
    });

    if (response.errors) {
      if (upsert) {
        logger.error(
          "elasticsearch-activities",
          JSON.stringify({
            topic: "save-errors",
            upsert,
            data: {
              activities: JSON.stringify(activities),
            },
            response,
          })
        );
      } else {
        logger.debug(
          "elasticsearch-activities",
          JSON.stringify({
            topic: "save-conflicts",
            upsert,
            data: {
              activities: JSON.stringify(activities),
            },
            response,
          })
        );
      }
    }
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "save",
        upsert,
        data: {
          activities: JSON.stringify(activities),
        },
        error,
      })
    );

    throw error;
  }
};

export const getChainStatsFromActivity = async () => {
  const now = Date.now();

  // rounds to 5 minute intervals to take advantage of caching
  const oneDayAgo =
    (Math.floor((now - 24 * 60 * 60 * 1000) / (5 * 60 * 1000)) * (5 * 60 * 1000)) / 1000;
  const sevenDaysAgo =
    (Math.floor((now - 7 * 24 * 60 * 60 * 1000) / (5 * 60 * 1000)) * (5 * 60 * 1000)) / 1000;

  const periods = [
    {
      name: "1day",
      startTime: oneDayAgo,
    },
    {
      name: "7day",
      startTime: sevenDaysAgo,
    },
  ];

  const queries = periods.map(
    (period) =>
      ({
        name: period.name,
        body: {
          query: {
            constant_score: {
              filter: {
                bool: {
                  filter: [
                    {
                      terms: {
                        type: ["sale", "mint"],
                      },
                    },
                    {
                      range: {
                        timestamp: {
                          gte: period.startTime,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          aggs: {
            sales_by_type: {
              terms: {
                field: "type",
              },
              aggs: {
                sales_count: {
                  value_count: { field: "id" },
                },
                total_volume: {
                  sum: { field: "pricing.priceDecimal" },
                },
              },
            },
          },
          size: 0,
        },
      } as any)
  );

  // fetch time periods in parallel
  const results = (await Promise.all(
    queries.map((query) => {
      return elasticsearch
        .search({
          index: INDEX_NAME,
          body: query.body,
        })
        .then((result) => ({ name: query.name, result }));
    })
  )) as any;

  return results.reduce((stats: any, result: any) => {
    const buckets = result?.result?.aggregations?.sales_by_type?.buckets as any;
    const mints = buckets.find((bucket: any) => bucket.key == "mint");
    const sales = buckets.find((bucket: any) => bucket.key == "sale");

    const mintCount = mints?.sales_count?.value || 0;
    const saleCount = sales?.sales_count?.value || 0;
    const mintVolume = mints?.total_volume?.value || 0;
    const saleVolume = sales?.total_volume?.value || 0;

    return {
      ...stats,
      [result.name]: {
        mintCount,
        saleCount,
        totalCount: mintCount + saleCount,
        mintVolume: _.round(mintVolume, 2),
        saleVolume: _.round(saleVolume, 2),
        totalVolume: _.round(mintVolume + saleVolume, 2),
      },
    };
  }, {});
};

export enum TopSellingFillOptions {
  sale = "sale",
  mint = "mint",
  any = "any",
}

const mapBucketToCollection = (bucket: any, includeRecentSales: boolean) => {
  const collectionData = bucket?.top_collection_hits?.hits?.hits[0]?._source.collection;

  const recentSales = bucket?.top_collection_hits?.hits?.hits.map((hit: any) => {
    const sale = hit._source;

    return {
      contract: sale.contract,
      token: sale.token,
      collection: sale.collection,
      toAddress: sale.toAddress,
      type: sale.type,
      timestamp: sale.timestamp,
      pricing: sale.pricing,
    };
  });

  return {
    volume: bucket?.total_volume?.value,
    count: bucket?.total_transactions?.value,
    id: collectionData?.id,
    name: collectionData?.name,
    image: collectionData?.image,
    primaryContract: collectionData?.contract,
    recentSales: includeRecentSales ? recentSales : [],
  };
};

export const getTopSellingCollections = async (params: {
  startTime: number;
  endTime?: number;
  fillType: TopSellingFillOptions;
  limit: number;
  includeRecentSales: boolean;
}): Promise<CollectionAggregation[]> => {
  const { startTime, endTime, fillType, limit } = params;

  const salesQuery = {
    bool: {
      filter: [
        {
          terms: {
            type: fillType == "any" ? ["sale", "mint"] : [fillType],
          },
        },
        {
          range: {
            timestamp: {
              gte: startTime,
              ...(endTime ? { lte: endTime } : {}),
            },
          },
        },
      ],
    },
  } as any;

  const collectionAggregation = {
    collections: {
      terms: {
        field: "collection.id",
        size: limit,
        order: { total_transactions: "desc" },
      },
      aggs: {
        total_transactions: {
          value_count: {
            field: "id",
          },
        },

        total_volume: {
          sum: {
            field: "pricing.priceDecimal",
          },
        },

        top_collection_hits: {
          top_hits: {
            _source: {
              includes: [
                "contract",
                "collection.name",
                "collection.image",
                "collection.id",
                "name",
                "toAddress",
                "token.id",
                "token.name",
                "token.image",
                "type",
                "timestamp",
                "pricing.price",
                "pricing.priceDecimal",
                "pricing.currencyPrice",
                "pricing.usdPrice",
                "pricing.feeBps",
                "pricing.currency",
                "pricing.value",
                "pricing.valueDecimal",
                "pricing.currencyValue",
                "pricing.normalizedValue",
                "pricing.normalizedValueDecimal",
                "pricing.currencyNormalizedValue",
              ],
            },
            size: params.includeRecentSales ? 8 : 1,

            ...(params.includeRecentSales && {
              sort: [
                {
                  timestamp: {
                    order: "desc",
                  },
                },
              ],
            }),
          },
        },
      },
    },
  } as any;

  const esResult = (await elasticsearch.search({
    index: INDEX_NAME,
    size: 0,
    body: {
      query: salesQuery,
      aggs: collectionAggregation,
    },
  })) as any;

  return esResult?.aggregations?.collections?.buckets?.map((bucket: any) =>
    mapBucketToCollection(bucket, params.includeRecentSales)
  );
};

export const deleteActivitiesById = async (ids: string[]): Promise<void> => {
  try {
    const response = await elasticsearch.bulk({
      body: ids.flatMap((id) => ({ delete: { _index: INDEX_NAME, _id: id } })),
    });

    if (response.errors) {
      logger.warn(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "delete-by-id-conflicts",
          data: {
            ids: JSON.stringify(ids),
          },
          response,
        })
      );
    }
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "delete-by-id-error",
        data: {
          ids: JSON.stringify(ids),
        },
        error,
      })
    );

    throw error;
  }
};

export const search = async (
  params: {
    types?: ActivityType[];
    tokens?: { contract: string; tokenId: string }[];
    contracts?: string[];
    collections?: string[];
    sources?: number[];
    users?: string[];
    startTimestamp?: number;
    endTimestamp?: number;
    sortBy?: "timestamp" | "createdAt";
    limit?: number;
    continuation?: string | null;
    continuationAsInt?: boolean;
  },
  debug = false
): Promise<{ activities: ActivityDocument[]; continuation: string | null }> => {
  const esQuery = {};

  (esQuery as any).bool = { filter: [] };

  if (params.types?.length) {
    (esQuery as any).bool.filter.push({ terms: { type: params.types } });
  }

  if (params.collections?.length) {
    const collections = params.collections.map((collection) => collection.toLowerCase());

    (esQuery as any).bool.filter.push({
      terms: { "collection.id": collections },
    });
  }

  if (params.contracts?.length) {
    const contracts = params.contracts.map((contract) => contract.toLowerCase());

    (esQuery as any).bool.filter.push({
      terms: { contract: contracts },
    });
  }

  if (params.sources?.length) {
    (esQuery as any).bool.filter.push({
      terms: { "order.sourceId": params.sources },
    });
  }

  if (params.tokens?.length) {
    if (params.contracts?.length === 1) {
      (esQuery as any).bool.filter.push({
        terms: { "token.id": params.tokens.map((token) => token.tokenId) },
      });
    } else {
      const tokensFilter = { bool: { should: [] } };

      for (const token of params.tokens) {
        const contract = token.contract.toLowerCase();
        const tokenId = token.tokenId;

        (tokensFilter as any).bool.should.push({
          bool: {
            must: [
              {
                term: { contract },
              },
              {
                term: { ["token.id"]: tokenId },
              },
            ],
          },
        });
      }

      (esQuery as any).bool.filter.push(tokensFilter);
    }
  }

  if (params.users?.length) {
    const users = params.users.map((user) => user.toLowerCase());

    const usersFilter = { bool: { should: [] } };

    (usersFilter as any).bool.should.push({
      terms: { fromAddress: users },
    });

    (usersFilter as any).bool.should.push({
      terms: { toAddress: users },
    });

    (esQuery as any).bool.filter.push(usersFilter);
  }

  if (params.startTimestamp) {
    (esQuery as any).bool.filter.push({
      range: { timestamp: { gte: params.endTimestamp } },
    });
  }

  if (params.endTimestamp) {
    (esQuery as any).bool.filter.push({
      range: { timestamp: { lt: params.endTimestamp } },
    });
  }

  const esSort: any[] = [];

  if (params.sortBy == "timestamp") {
    esSort.push({ timestamp: { order: "desc" } });
  } else {
    esSort.push({ createdAt: { order: "desc" } });
  }

  let searchAfter;

  if (params.continuation) {
    if (params.continuationAsInt) {
      searchAfter = [params.continuation];
    } else {
      searchAfter = [splitContinuation(params.continuation)[0]];
    }
  }

  try {
    const activities = await _search(
      {
        query: esQuery,
        sort: esSort as Sort,
        size: params.limit,
        search_after: searchAfter,
      },
      0,
      debug
    );

    let continuation = null;

    if (activities.length === params.limit) {
      const lastActivity = _.last(activities);

      if (lastActivity) {
        if (params.continuationAsInt) {
          continuation = `${lastActivity.timestamp}`;
        } else {
          const continuationValue =
            params.sortBy == "timestamp"
              ? lastActivity.timestamp
              : new Date(lastActivity.createdAt).toISOString();
          continuation = buildContinuation(`${continuationValue}`);
        }
      }
    }

    return { activities, continuation };
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "search",
        data: {
          params: params,
        },
        error,
      })
    );

    throw error;
  }
};

export const _search = async (
  params: {
    query?: QueryDslQueryContainer | undefined;
    sort?: Sort | undefined;
    size?: number | undefined;
    search_after?: SortResults | undefined;
    track_total_hits?: boolean;
  },
  retries = 0,
  debug = false
): Promise<ActivityDocument[]> => {
  try {
    params.track_total_hits = params.track_total_hits ?? false;

    const esResult = await elasticsearch.search<ActivityDocument>({
      index: INDEX_NAME,
      ...params,
    });

    const results = esResult.hits.hits.map((hit) => hit._source!);

    if (retries > 0 || debug) {
      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "_search",
          latency: esResult.took,
          params: JSON.stringify(params),
          retries,
        })
      );
    }

    return results;
  } catch (error) {
    const retryableError =
      (error as any).meta?.meta?.aborted ||
      (error as any).meta?.body?.error?.caused_by?.type === "node_not_connected_exception";

    if (retryableError) {
      logger.warn(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "_search",
          message: "Retrying...",
          data: {
            params: JSON.stringify(params),
          },
          error,
          retries,
        })
      );

      if (retries <= 3) {
        retries += 1;
        return _search(params, retries, debug);
      }

      logger.error(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "_search",
          message: "Max retries reached.",
          data: {
            params: JSON.stringify(params),
          },
          error,
          retries,
        })
      );

      throw new Error("Could not perform search.");
    } else {
      logger.error(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "_search",
          message: "Unexpected error.",
          data: {
            params: JSON.stringify(params),
          },
          error,
          retries,
        })
      );
    }

    throw error;
  }
};

export const getIndexName = (): string => {
  return INDEX_NAME;
};

export const initIndex = async (): Promise<void> => {
  try {
    if (await elasticsearch.indices.exists({ index: INDEX_NAME })) {
      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "initIndex",
          message: "Index already exists.",
          indexName: INDEX_NAME,
        })
      );

      const getIndexResponse = await elasticsearch.indices.get({ index: INDEX_NAME });

      const indexName = Object.keys(getIndexResponse)[0];

      const putMappingResponse = await elasticsearch.indices.putMapping({
        index: indexName,
        properties: MAPPINGS.properties,
      });

      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "initIndex",
          message: "Updated mappings.",
          indexName: INDEX_NAME,
          mappings: MAPPINGS.properties,
          putMappingResponse,
        })
      );
    } else {
      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "initIndex",
          message: "Creating Index.",
          indexName: INDEX_NAME,
        })
      );

      const params = {
        aliases: {
          [INDEX_NAME]: {},
        },
        index: `${INDEX_NAME}-${Date.now()}`,
        mappings: MAPPINGS,
        settings: {
          number_of_shards:
            getNetworkSettings().elasticsearch?.indexes?.activities?.numberOfShards ||
            getNetworkSettings().elasticsearch?.numberOfShards ||
            1,
          sort: {
            field: ["timestamp", "createdAt"],
            order: ["desc", "desc"],
          },
        },
      };

      const createIndexResponse = await elasticsearch.indices.create(params);

      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "initIndex",
          message: "Index Created!",
          indexName: INDEX_NAME,
          params,
          createIndexResponse,
        })
      );

      await backfillActivitiesAddToQueue(false);
    }
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "initIndex",
        message: "Error.",
        indexName: INDEX_NAME,
        error,
      })
    );

    throw error;
  }
};

export const updateActivitiesMissingCollection = async (
  contract: string,
  tokenId: number,
  collection: CollectionsEntity
): Promise<boolean> => {
  let keepGoing = false;

  const query = {
    bool: {
      must_not: [
        {
          exists: {
            field: "collection.id",
          },
        },
      ],
      must: [
        {
          term: {
            contract: contract.toLowerCase(),
          },
        },
        {
          term: {
            "token.id": tokenId,
          },
        },
      ],
    },
  };

  try {
    const pendingUpdateActivities = await _search({
      // This is needed due to issue with elasticsearch DSL.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      query,
      size: 1000,
    });

    if (pendingUpdateActivities.length) {
      const bulkParams = {
        body: pendingUpdateActivities.flatMap((activity) => [
          { update: { _index: INDEX_NAME, _id: activity.id, retry_on_conflict: 3 } },
          {
            script: {
              source:
                "ctx._source.collection = [:]; ctx._source.collection.id = params.collection_id; ctx._source.collection.name = params.collection_name; ctx._source.collection.image = params.collection_image;",
              params: {
                collection_id: collection.id,
                collection_name: collection.name,
                collection_image: collection.metadata?.imageUrl,
              },
            },
          },
        ]),
        filter_path: "items.*.error",
      };

      const response = await elasticsearch.bulk(bulkParams, { ignore: [404] });

      if (response?.errors) {
        keepGoing = response?.items.some((item) => item.update?.status !== 400);

        logger.error(
          "elasticsearch-activities",
          JSON.stringify({
            topic: "updateActivitiesMissingCollectionV2",
            message: `Errors in response`,
            data: {
              contract,
              tokenId,
              collection,
            },
            bulkParams,
            response,
            keepGoing,
          })
        );
      } else {
        keepGoing = pendingUpdateActivities.length === 1000;

        logger.info(
          "elasticsearch-activities",
          JSON.stringify({
            topic: "updateActivitiesMissingCollectionV2",
            message: `Success`,
            data: {
              contract,
              tokenId,
              collection,
            },
            bulkParams,
            response,
            keepGoing,
          })
        );
      }
    }
  } catch (error) {
    const retryableError =
      (error as any).meta?.meta?.aborted ||
      (error as any).meta?.body?.error?.caused_by?.type === "node_not_connected_exception";

    if (retryableError) {
      logger.warn(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesMissingCollectionV2",
          message: `Unexpected error`,
          data: {
            contract,
            tokenId,
            collection,
          },
          error,
        })
      );

      keepGoing = true;
    } else {
      logger.error(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesMissingCollectionV2",
          message: `Unexpected error`,
          data: {
            contract,
            tokenId,
            collection,
          },
          error,
        })
      );

      throw error;
    }
  }

  return keepGoing;
};

export const updateActivitiesCollection = async (
  contract: string,
  tokenId: string,
  newCollection: CollectionsEntity,
  oldCollectionId: string
): Promise<boolean> => {
  let keepGoing = false;

  const query = {
    bool: {
      must: [
        {
          term: {
            contract: contract.toLowerCase(),
          },
        },
        {
          term: {
            "token.id": tokenId,
          },
        },
      ],
    },
  };

  try {
    const pendingUpdateActivities = await _search({
      // This is needed due to issue with elasticsearch DSL.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      query,
      size: 1000,
    });

    if (pendingUpdateActivities.length) {
      const bulkParams = {
        body: pendingUpdateActivities.flatMap((activity) => [
          { update: { _index: INDEX_NAME, _id: activity.id, retry_on_conflict: 3 } },
          {
            script: {
              source:
                "ctx._source.collection = [:]; ctx._source.collection.id = params.collection_id; ctx._source.collection.name = params.collection_name; ctx._source.collection.image = params.collection_image;",
              params: {
                collection_id: newCollection.id,
                collection_name: newCollection.name,
                collection_image: newCollection.metadata?.imageUrl,
              },
            },
          },
        ]),
        filter_path: "items.*.error",
      };

      const response = await elasticsearch.bulk(bulkParams, { ignore: [404] });

      if (response?.errors) {
        keepGoing = response?.items.some((item) => item.update?.status !== 400);

        logger.error(
          "elasticsearch-activities",
          JSON.stringify({
            topic: "updateActivitiesCollectionV2",
            message: `Errors in response`,
            data: {
              contract,
              tokenId,
              newCollection,
              oldCollectionId,
            },
            bulkParams,
            response,
          })
        );
      } else {
        keepGoing = pendingUpdateActivities.length === 1000;

        logger.info(
          "elasticsearch-activities",
          JSON.stringify({
            topic: "updateActivitiesCollectionV2",
            message: `Success`,
            data: {
              contract,
              tokenId,
              newCollection,
              oldCollectionId,
            },
            bulkParams,
            response,
            keepGoing,
          })
        );
      }
    }
  } catch (error) {
    const retryableError =
      (error as any).meta?.meta?.aborted ||
      (error as any).meta?.body?.error?.caused_by?.type === "node_not_connected_exception";

    if (retryableError) {
      logger.warn(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesCollectionV2",
          message: `Unexpected error`,
          data: {
            contract,
            tokenId,
            newCollection,
            oldCollectionId,
          },
          error,
        })
      );

      keepGoing = true;
    } else {
      logger.error(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesCollectionV2",
          message: `Unexpected error`,
          data: {
            contract,
            tokenId,
            newCollection,
            oldCollectionId,
          },
          error,
        })
      );

      throw error;
    }
  }

  return keepGoing;
};

export const updateActivitiesTokenMetadata = async (
  contract: string,
  tokenId: string,
  tokenData: { name: string | null; image: string | null; media: string | null }
): Promise<boolean> => {
  let keepGoing = false;

  const should: any[] = [
    {
      bool: tokenData.name
        ? {
            must_not: [
              {
                term: {
                  "token.name": tokenData.name,
                },
              },
            ],
          }
        : {
            must: [
              {
                exists: {
                  field: "token.name",
                },
              },
            ],
          },
    },
    {
      bool: tokenData.image
        ? {
            must_not: [
              {
                term: {
                  "token.image": tokenData.image,
                },
              },
            ],
          }
        : {
            must: [
              {
                exists: {
                  field: "token.image",
                },
              },
            ],
          },
    },
    {
      bool: tokenData.media
        ? {
            must_not: [
              {
                term: {
                  "token.media": tokenData.media,
                },
              },
            ],
          }
        : {
            must: [
              {
                exists: {
                  field: "token.media",
                },
              },
            ],
          },
    },
  ];

  const query = {
    bool: {
      must: [
        {
          term: {
            contract: contract.toLowerCase(),
          },
        },
        {
          term: {
            "token.id": tokenId,
          },
        },
      ],
      filter: {
        bool: {
          should,
        },
      },
    },
  };

  try {
    const pendingUpdateActivities = await _search({
      // This is needed due to issue with elasticsearch DSL.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      query,
      size: 1000,
    });

    if (pendingUpdateActivities.length) {
      const bulkParams = {
        body: pendingUpdateActivities.flatMap((activity) => [
          { update: { _index: INDEX_NAME, _id: activity.id, retry_on_conflict: 3 } },
          {
            script: {
              source:
                "if (params.token_name == null) { ctx._source.token.remove('name') } else { ctx._source.token.name = params.token_name } if (params.token_image == null) { ctx._source.token.remove('image') } else { ctx._source.token.image = params.token_image } if (params.token_media == null) { ctx._source.token.remove('media') } else { ctx._source.token.media = params.token_media }",
              params: {
                token_name: tokenData.name ?? null,
                token_image: tokenData.image ?? null,
                token_media: tokenData.media ?? null,
              },
            },
          },
        ]),
        filter_path: "items.*.error",
      };

      const response = await elasticsearch.bulk(bulkParams, { ignore: [404] });

      if (response?.errors) {
        keepGoing = response?.items.some((item) => item.update?.status !== 400);

        logger.error(
          "elasticsearch-activities",
          JSON.stringify({
            topic: "updateActivitiesTokenMetadataV2",
            message: `Errors in response`,
            data: {
              contract,
              tokenId,
              tokenData,
            },
            bulkParams,
            response,
          })
        );
      } else {
        keepGoing = pendingUpdateActivities.length === 1000;

        logger.info(
          "elasticsearch-activities",
          JSON.stringify({
            topic: "updateActivitiesTokenMetadataV2",
            message: `Success`,
            data: {
              contract,
              tokenId,
              tokenData,
            },
            bulkParams,
            response,
            keepGoing,
          })
        );
      }
    }
  } catch (error) {
    const retryableError =
      (error as any).meta?.meta?.aborted ||
      (error as any).meta?.body?.error?.caused_by?.type === "node_not_connected_exception";

    if (retryableError) {
      logger.warn(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesTokenMetadataV2",
          message: `Unexpected error`,
          data: {
            contract,
            tokenId,
            tokenData,
          },
          error,
        })
      );

      keepGoing = true;
    } else {
      logger.error(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesTokenMetadataV2",
          message: `Unexpected error`,
          data: {
            contract,
            tokenId,
            tokenData,
          },
          error,
        })
      );

      throw error;
    }
  }

  return keepGoing;
};

export const updateActivitiesCollectionMetadata = async (
  collectionId: string,
  collectionData: { name: string | null; image: string | null }
): Promise<boolean> => {
  let keepGoing = false;

  const should: any[] = [
    {
      bool: collectionData.name
        ? {
            must_not: [
              {
                term: {
                  "collection.name": collectionData.name,
                },
              },
            ],
          }
        : {
            must: [
              {
                exists: {
                  field: "collection.name",
                },
              },
            ],
          },
    },
    {
      bool: collectionData.image
        ? {
            must_not: [
              {
                term: {
                  "collection.image": collectionData.image,
                },
              },
            ],
          }
        : {
            must: [
              {
                exists: {
                  field: "collection.image",
                },
              },
            ],
          },
    },
  ];

  const query = {
    bool: {
      must: [
        {
          term: {
            "collection.id": collectionId.toLowerCase(),
          },
        },
      ],
      filter: {
        bool: {
          should,
        },
      },
    },
  };

  try {
    const pendingUpdateActivities = await _search({
      // This is needed due to issue with elasticsearch DSL.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      query,
      size: 1000,
    });

    if (pendingUpdateActivities.length) {
      const bulkParams = {
        body: pendingUpdateActivities.flatMap((activity) => [
          { update: { _index: INDEX_NAME, _id: activity.id, retry_on_conflict: 3 } },
          {
            script: {
              source:
                "if (params.collection_name == null) { ctx._source.collection.remove('name') } else { ctx._source.collection.name = params.collection_name } if (params.collection_image == null) { ctx._source.collection.remove('image') } else { ctx._source.collection.image = params.collection_image }",
              params: {
                collection_name: collectionData.name ?? null,
                collection_image: collectionData.image ?? null,
              },
            },
          },
        ]),
        filter_path: "items.*.error",
      };

      const response = await elasticsearch.bulk(bulkParams, { ignore: [404] });

      if (response?.errors) {
        keepGoing = response?.items.some((item) => item.update?.status !== 400);

        logger.error(
          "elasticsearch-activities",
          JSON.stringify({
            topic: "updateActivitiesCollectionMetadataV2",
            message: `Errors in response`,
            data: {
              collectionId,
              collectionData,
            },
            bulkParams,
            response,
            keepGoing,
          })
        );
      } else {
        keepGoing = pendingUpdateActivities.length === 1000;

        logger.info(
          "elasticsearch-activities",
          JSON.stringify({
            topic: "updateActivitiesCollectionMetadataV2",
            message: `Success`,
            data: {
              collectionId,
              collectionData,
            },
            bulkParams,
            response,
            keepGoing,
          })
        );
      }
    }
  } catch (error) {
    const retryableError =
      (error as any).meta?.meta?.aborted ||
      (error as any).meta?.body?.error?.caused_by?.type === "node_not_connected_exception";

    if (retryableError) {
      logger.warn(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesCollectionMetadataV2",
          message: `Unexpected error`,
          data: {
            collectionId,
            collectionData,
          },
          error,
        })
      );

      keepGoing = true;
    } else {
      logger.error(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesCollectionMetadataV2",
          message: `Unexpected error`,
          data: {
            collectionId,
            collectionData,
          },
          error,
        })
      );

      throw error;
    }
  }

  return keepGoing;
};

export const deleteActivitiesByBlockHash = async (blockHash: string): Promise<boolean> => {
  let keepGoing = false;

  const query = {
    bool: {
      must: [
        {
          term: {
            "event.blockHash": blockHash,
          },
        },
      ],
    },
  };

  try {
    const pendingDeleteActivities = await _search({
      // This is needed due to issue with elasticsearch DSL.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      query,
      size: 1000,
    });

    if (pendingDeleteActivities.length) {
      const bulkParams = {
        body: pendingDeleteActivities.flatMap((activity) => [
          { delete: { _index: INDEX_NAME, _id: activity.id } },
        ]),
        filter_path: "items.*.error",
      };

      const response = await elasticsearch.bulk(bulkParams, { ignore: [404] });

      if (response?.errors) {
        keepGoing = response?.items.some((item) => item.update?.status !== 400);

        logger.error(
          "elasticsearch-activities",
          JSON.stringify({
            topic: "deleteActivitiesByBlockHashV2",
            message: `Errors in response`,
            data: {
              blockHash,
            },
            bulkParams,
            response,
            keepGoing,
          })
        );
      } else {
        keepGoing = pendingDeleteActivities.length === 1000;

        logger.info(
          "elasticsearch-activities",
          JSON.stringify({
            topic: "deleteActivitiesByBlockHashV2",
            message: `Success`,
            data: {
              blockHash,
            },
            bulkParams,
            response,
            keepGoing,
          })
        );
      }
    }
  } catch (error) {
    const retryableError =
      (error as any).meta?.meta?.aborted ||
      (error as any).meta?.body?.error?.caused_by?.type === "node_not_connected_exception";

    if (retryableError) {
      logger.warn(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "deleteActivitiesByBlockHashV2",
          message: `Unexpected error`,
          data: {
            blockHash,
          },
          error,
        })
      );

      keepGoing = true;
    } else {
      logger.error(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "deleteActivitiesByBlockHashV2",
          message: `Unexpected error`,
          data: {
            blockHash,
          },
          error,
        })
      );

      throw error;
    }
  }

  return keepGoing;
};
