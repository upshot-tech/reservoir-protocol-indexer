-- Up Migration

CREATE TABLE "dittoswap_pools" (
  "address" BYTEA NOT NULL,
  "nft" BYTEA NOT NULL, 
  "token" BYTEA NOT NULL,
  "bonding_curve" BYTEA NOT NULL,
  "pool_kind" SMALLINT NOT NULL,
  "pair_kind" SMALLINT NOT NULL,
  "property_checker" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) DEFAULT NULL
);

ALTER TABLE "dittoswap_pools"
  ADD CONSTRAINT "dittoswap_pools_pk"
  PRIMARY KEY ("address");

-- Down Migration

DROP TABLE "dittoswap_pools";