import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { Transaction } from "@/models/transactions";
import {
  CollectionMint,
  getCollectionMints,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import { AllowlistItem, allowlistExists, createAllowlist } from "@/orderbook/mints/allowlists";
import { getStatus, toSafeTimestamp } from "@/orderbook/mints/calldata/helpers";

const STANDARD = "zora";

export const extractByCollection = async (
  collection: string,
  tokenId?: string
): Promise<CollectionMint[]> => {
  const results: CollectionMint[] = [];
  if (tokenId) {
    // ERC1155

    const c = new Contract(
      collection,
      new Interface([
        "function getPermissions(uint256 tokenId, address user) view returns (uint256)",
        "function mintFee() external view returns(uint256)",
        `function getTokenInfo(uint256 tokenId) view returns (
          (
            string uri,
            uint256 maxSupply,
            uint256 totalMinted
          )
        )`,
      ]),
      baseProvider
    );

    try {
      const zoraFactory = new Contract(
        Sdk.Zora.Addresses.ERC1155Factory[config.chainId],
        new Interface(["function defaultMinters() view returns (address[])"]),
        baseProvider
      );
      const defaultMinters = await zoraFactory.defaultMinters();
      for (const minter of defaultMinters) {
        const permissions = await c.getPermissions(tokenId, minter);
        // Need to have mint permissions
        if (permissions.toNumber() === 4) {
          const s = new Contract(
            minter,
            new Interface(["function contractName() external view returns (string memory)"]),
            baseProvider
          );

          const contractName = await s.contractName();
          if (contractName === "Fixed Price Sale Strategy") {
            const fixedSale = new Contract(
              minter,
              new Interface([
                `function sale(address tokenContract, uint256 tokenId) view returns (
                  (
                    uint64 saleStart,
                    uint64 saleEnd,
                    uint64 maxTokensPerAddress,
                    uint96 pricePerToken,
                    address fundsRecipient
                  )
                )`,
              ]),
              baseProvider
            );

            const [saleConfig, tokenInfo, mintFee] = await Promise.all([
              fixedSale.sale(collection, tokenId),
              c.getTokenInfo(tokenId),
              c.mintFee(),
            ]);

            const price = saleConfig.pricePerToken.add(mintFee).toString();
            results.push({
              collection,
              contract: collection,
              stage: "public-sale",
              kind: "public",
              status: "open",
              standard: STANDARD,
              details: {
                tx: {
                  to: collection,
                  data: {
                    // `mint`
                    signature: "0x731133e9",
                    params: [
                      {
                        kind: "unknown",
                        abiType: "address",
                        abiValue: minter.toLowerCase(),
                      },
                      {
                        kind: "unknown",
                        abiType: "uint256",
                        abiValue: tokenId,
                      },
                      {
                        kind: "quantity",
                        abiType: "uint256",
                      },
                      {
                        kind: "custom",
                        abiType: "bytes",
                      },
                    ],
                  },
                },
              },
              currency: Sdk.Common.Addresses.Eth[config.chainId],
              price,
              maxMintsPerWallet: bn(saleConfig.maxTokensPerAddress).eq(0)
                ? null
                : saleConfig.maxTokensPerAddress.toString(),
              tokenId,
              maxSupply: tokenInfo.maxSupply.toString(),
              startTime: toSafeTimestamp(saleConfig.saleStart),
              endTime: toSafeTimestamp(saleConfig.saleEnd),
            });
          } else if (contractName === "Merkle Tree Sale Strategy") {
            const merkleSale = new Contract(
              minter,
              new Interface([
                `function sale(address tokenContract, uint256 tokenId) view returns (
                  (
                    uint64 presaleStart,
                    uint64 presaleEnd,
                    address fundsRecipient,
                    bytes32 merkleRoot
                  )
                )`,
              ]),
              baseProvider
            );

            const [saleConfig, tokenInfo, mintFee] = await Promise.all([
              merkleSale.sale(collection, tokenId),
              c.getTokenInfo(tokenId),
              c.mintFee(),
            ]);

            const merkleRoot = merkleSale.merkleRoot;
            if (!(await allowlistExists(merkleRoot))) {
              await axios
                .get(`https://allowlist.zora.co/allowlist/${merkleRoot}`)
                .then(({ data }) => data)
                .then(
                  async (data: {
                    entries: { user: string; price: string; maxCanMint: number }[];
                  }) => {
                    return data.entries.map(
                      (e) =>
                        ({
                          address: e.user,
                          maxMints: String(e.maxCanMint),
                          // price = on-chain-price
                          price: e.price,
                          // actualPrice = on-chain-price + fee
                          actualPrice: bn(e.price).add(mintFee).toString(),
                        } as AllowlistItem)
                    );
                  }
                )
                .then((items) => createAllowlist(merkleRoot, items));
            }

            results.push({
              collection,
              contract: collection,
              stage: "presale",
              kind: "allowlist",
              status: "open",
              standard: STANDARD,
              details: {
                tx: {
                  to: collection,
                  data: {
                    // `mint`
                    signature: "0x731133e9",
                    params: [
                      {
                        kind: "unknown",
                        abiType: "address",
                        abiValue: minter.toLowerCase(),
                      },
                      {
                        kind: "unknown",
                        abiType: "uint256",
                        abiValue: tokenId.toString(),
                      },
                      {
                        kind: "quantity",
                        abiType: "uint256",
                      },
                      {
                        kind: "allowlist",
                        abiType: "bytes",
                      },
                    ],
                  },
                },
              },
              currency: Sdk.Common.Addresses.Eth[config.chainId],
              maxSupply: tokenInfo.maxSupply.toString(),
              startTime: toSafeTimestamp(saleConfig.presaleStart),
              endTime: toSafeTimestamp(saleConfig.presaleEnd),
              allowlistId: merkleRoot,
            });
          }

          break;
        }
      }
    } catch (error) {
      logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
    }
  } else {
    // ERC721

    const c = new Contract(
      collection,
      new Interface([
        `
          function saleDetails() view returns (
            (
              bool publicSaleActive,
              bool presaleActive,
              uint256 publicSalePrice,
              uint64 publicSaleStart,
              uint64 publicSaleEnd,
              uint64 presaleStart,
              uint64 presaleEnd,
              bytes32 presaleMerkleRoot,
              uint256 maxSalePurchasePerAddress,
              uint256 totalMinted,
              uint256 maxSupply
            )
          )
        `,
        "function zoraFeeForAmount(uint256 quantity) view returns (address recipient, uint256 fee)",
      ]),
      baseProvider
    );

    try {
      const saleDetails = await c.saleDetails();
      const fee = await c.zoraFeeForAmount(1).then((f: { fee: BigNumber }) => f.fee);

      // Public sale
      if (saleDetails.publicSaleActive) {
        // price = on-chain-price + fee
        const price = bn(saleDetails.publicSalePrice).add(fee).toString();

        results.push({
          collection,
          contract: collection,
          stage: "public-sale",
          kind: "public",
          status: "open",
          standard: STANDARD,
          details: {
            tx: {
              to: collection,
              data: {
                // `purchase`
                signature: "0xefef39a1",
                params: [
                  {
                    kind: "quantity",
                    abiType: "uint256",
                  },
                ],
              },
            },
          },
          currency: Sdk.Common.Addresses.Eth[config.chainId],
          price,
          maxMintsPerWallet: saleDetails.maxSalePurchasePerAddress.toString(),
          maxSupply: saleDetails.maxSupply.toString(),
          startTime: toSafeTimestamp(saleDetails.publicSaleStart),
          endTime: toSafeTimestamp(saleDetails.publicSaleEnd),
        });
      }

      // Presale
      if (saleDetails.presaleActive) {
        const merkleRoot = saleDetails.presaleMerkleRoot;
        if (!(await allowlistExists(merkleRoot))) {
          await axios
            .get(`https://allowlist.zora.co/allowlist/${merkleRoot}`)
            .then(({ data }) => data)
            .then(
              async (data: { entries: { user: string; price: string; maxCanMint: number }[] }) => {
                return data.entries.map(
                  (e) =>
                    ({
                      address: e.user,
                      maxMints: String(e.maxCanMint),
                      // price = on-chain-price
                      price: e.price,
                      // actualPrice = on-chain-price + fee
                      actualPrice: bn(e.price).add(fee).toString(),
                    } as AllowlistItem)
                );
              }
            )
            .then((items) => createAllowlist(merkleRoot, items));
        }

        results.push({
          collection,
          contract: collection,
          stage: "presale",
          kind: "allowlist",
          status: "open",
          standard: STANDARD,
          details: {
            tx: {
              to: collection,
              data: {
                // `purchasePresale`
                signature: "0x25024a2b",
                params: [
                  {
                    kind: "quantity",
                    abiType: "uint256",
                  },
                  {
                    kind: "allowlist",
                    abiType: "uint256",
                  },
                  {
                    kind: "allowlist",
                    abiType: "uint256",
                  },
                  {
                    kind: "allowlist",
                    abiType: "bytes32[]",
                  },
                ],
              },
            },
          },
          currency: Sdk.Common.Addresses.Eth[config.chainId],
          maxSupply: saleDetails.maxSupply.toString(),
          startTime: toSafeTimestamp(saleDetails.presaleStart),
          endTime: toSafeTimestamp(saleDetails.presaleEnd),
          allowlistId: merkleRoot,
        });
      }
    } catch (error) {
      logger.error("mint-detector", JSON.stringify({ kind: STANDARD, error }));
    }
  }

  // Update the status of each collection mint
  await Promise.all(
    results.map(async (cm) => {
      await getStatus(cm).then(({ status, reason }) => {
        cm.status = status;
        cm.statusReason = reason;
      });
    })
  );

  return results;
};

export const extractByTx = async (
  collection: string,
  tx: Transaction
): Promise<CollectionMint[]> => {
  if (
    [
      "0xefef39a1", // `purchase`
      "0x03ee2733", // `purchaseWithComment`
      "0x25024a2b", // `purchasePresale`
      "0x2e706b5a", // `purchasePresaleWithComment`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    return extractByCollection(collection);
  }

  if (
    [
      "0x731133e9", // `mint`
    ].some((bytes4) => tx.data.startsWith(bytes4))
  ) {
    const tokenId = new Interface([
      "function mint(address minter, uint256 tokenId, uint256 quantity, bytes data)",
    ])
      .decodeFunctionData("mint", tx.data)
      .tokenId.toString();
    return extractByCollection(collection, tokenId);
  }

  return [];
};

export const refreshByCollection = async (collection: string) => {
  const existingCollectionMints = await getCollectionMints(collection, {
    standard: STANDARD,
  });

  const uniqueTokenIds = [...new Set(existingCollectionMints.map(({ tokenId }) => tokenId))];
  for (const tokenId of uniqueTokenIds) {
    // Fetch and save/update the currently available mints
    const latestCollectionMints = await extractByCollection(collection, tokenId);
    for (const collectionMint of latestCollectionMints) {
      await simulateAndUpsertCollectionMint(collectionMint);
    }

    // Assume anything that exists in our system but was not returned
    // in the above call is not available anymore so we can close
    for (const existing of existingCollectionMints) {
      if (
        !latestCollectionMints.find(
          (latest) =>
            latest.collection === existing.collection &&
            latest.stage === existing.stage &&
            latest.tokenId === existing.tokenId
        )
      ) {
        await simulateAndUpsertCollectionMint({
          ...existing,
          status: "closed",
        });
      }
    }
  }
};

type ProofValue = {
  proof: string[];
  user: string;
  price: string;
  maxCanMint: number;
};

export const generateProofValue = async (
  collectionMint: CollectionMint,
  address: string
): Promise<ProofValue> => {
  const cacheKey = `${collectionMint.collection}-${collectionMint.stage}-${collectionMint.tokenId}-${address}`;

  let result: ProofValue = await redis
    .get(cacheKey)
    .then((response) => (response ? JSON.parse(response) : undefined));
  if (!result) {
    result = await axios
      .get(`https://allowlist.zora.co/allowed?user=${address}&root=${collectionMint.allowlistId}`)
      .then(({ data }: { data: ProofValue[] }) => {
        data[0].proof = data[0].proof.map((item) => `0x${item}`);
        return data[0];
      });

    if (result) {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 3600);
    }
  }

  return result;
};
