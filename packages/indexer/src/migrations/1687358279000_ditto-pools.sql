-- Up Migration

CREATE TABLE "ditto_pools" (
  "address" BYTEA NOT NULL,
  "nft" BYTEA NOT NULL, 
  "token" BYTEA NOT NULL, 
  "permitter" BYTEA NOT NULL, 
  "isPrivatePool" BOOLEAN NOT NULL,
  "initialized" BOOLEAN NOT NULL,
  "template" BYTEA NOT NULL,
  "fee" INTEGER, -- bps - can be null
  "delta" DECIMAL,
  "adminFeeRecipient" BYTEA NOT NULL
);

ALTER TABLE "ditto_pools"
  ADD CONSTRAINT "ditto_pools_pk"
  PRIMARY KEY ("address");

ALTER TYPE "order_kind_t" ADD VALUE 'ditto';

-- Down Migration

DROP TABLE "ditto_pools";