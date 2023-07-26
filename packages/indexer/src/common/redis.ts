import { BulkJobOptions } from "bullmq";
import { randomUUID } from "crypto";
import Redis from "ioredis";
import _ from "lodash";
import Redlock from "redlock";

import { config } from "@/config/index";

// TODO: Research using a connection pool rather than
// creating a new connection every time, as we do now.

// Main redis
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  // To avoid annoying timeout errors
  connectTimeout: process.env.LOCAL_TESTING ? 1000 * 1000 : undefined,
});

export const redisSubscriber = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Websocket redis
export const redisWebsocketPublisher = new Redis(config.redisWebsocketUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const redisWebsocketClient = new Redis(config.redisWebsocketUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Rate limiter redis
export const rateLimitRedis = new Redis(config.rateLimitRedisUrl, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: false,
  enableOfflineQueue: false,
  commandTimeout: 600,
});

// Metric redis
export const metricsRedis = new Redis(config.metricsRedisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// All chains sync redis
export const allChainsSyncRedis = new Redis(config.allChainsSyncRedisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const allChainsSyncRedisSubscriber = new Redis(config.allChainsSyncRedisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// https://redis.io/topics/distlock
export const redlock = new Redlock([redis.duplicate()], { retryCount: 0 });

// Common types

export type BullMQBulkJob = {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  opts?: BulkJobOptions;
};

export const acquireLock = async (name: string, expirationInSeconds = 0) => {
  const id = randomUUID();
  let acquired;

  if (expirationInSeconds) {
    acquired = await redis.set(name, id, "EX", expirationInSeconds, "NX");
  } else {
    acquired = await redis.set(name, id, "NX");
  }

  return acquired === "OK";
};

export const extendLock = async (name: string, expirationInSeconds: number) => {
  const id = randomUUID();
  const extended = await redis.set(name, id, "EX", expirationInSeconds, "XX");
  return extended === "OK";
};

export const releaseLock = async (name: string) => {
  await redis.del(name);
};

export const getLockExpiration = async (name: string) => {
  return await redis.ttl(name);
};

export const getMemUsage = async () => {
  const memoryInfo = await redis.info("memory");
  const usedMemory = memoryInfo.match(/used_memory:\d+/);

  return usedMemory ? _.toInteger(_.split(usedMemory[0], ":")[1]) : 0;
};
