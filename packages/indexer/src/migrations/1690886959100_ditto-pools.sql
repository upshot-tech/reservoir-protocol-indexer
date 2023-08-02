-- Up Migration

CREATE TABLE "ditto_pools" (
  "address" BYTEA NOT NULL,
  "nft" BYTEA NOT NULL, 
  "token" BYTEA NOT NULL, 
  "permitter" BYTEA NOT NULL, 
  "is_private_pool" BOOLEAN NOT NULL,
  "initialized" BOOLEAN NOT NULL,
  "template" BYTEA NOT NULL,
  "fee" NUMERIC(78, 0), -- bps - can be null
  "delta" NUMERIC(78, 0),
  "admin_fee_recipient" BYTEA NOT NULL
);

ALTER TABLE "ditto_pools"
  ADD CONSTRAINT "ditto_pools_pk"
  PRIMARY KEY ("address");

ALTER TYPE "order_kind_t" ADD VALUE 'ditto';

-- Down Migration

DROP TABLE "ditto_pools";