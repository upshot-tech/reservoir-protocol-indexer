import { Contract } from "@ethersproject/contracts";
import { parseEther, parseUnits } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { BidDetails, ListingDetails } from "@reservoir0x/sdk/src/router/v6/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  bn,
  getChainId,
  getCurrentTimestamp,
  reset,
  setupNFTs,
  setupRouterWithModules,
} from "../utils";
import { PermitHandler } from "@reservoir0x/sdk/src/router/v6/permit";

describe("[ReservoirV6_0_1] Filling listings and bids via the SDK", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dan: SignerWithAddress;

  let erc721: Contract;
  let erc1155: Contract;

  beforeEach(async () => {
    [deployer, feeRecipient, alice, bob, carol, dan] = await ethers.getSigners();

    ({ erc721, erc1155 } = await setupNFTs(deployer));
    await setupRouterWithModules(chainId, deployer);
  });

  afterEach(reset);

  it("Fill multiple listings", async () => {
    const buyer = dan;

    const listings: ListingDetails[] = [];

    // Order 1: Seaport
    const seller1 = alice;
    const tokenId1 = 0;
    const price1 = parseEther("1");
    const fee1 = bn(550);
    {
      // Mint erc721 to seller
      await erc721.connect(seller1).mint(tokenId1);

      // Approve the exchange
      await erc721
        .connect(seller1)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller1.address,
          contract: erc721.address,
          tokenId: tokenId1,
          paymentToken: Sdk.Common.Addresses.Eth[chainId],
          price: price1.sub(price1.mul(fee1).div(10000)),
          fees: [
            {
              amount: price1.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller1);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
        price: price1.toString(),
      });
    }

    // Order 3: ZeroEx V4
    const seller3 = carol;
    const tokenId3 = 0;
    const totalAmount3 = 9;
    const amount3 = 5;
    const price3 = parseEther("2");
    const fee3 = parseEther("0.1");
    {
      // Mint erc1155 to seller
      await erc1155.connect(seller3).mintMany(tokenId3, totalAmount3);

      // Approve the exchange
      await erc1155
        .connect(seller3)
        .setApprovalForAll(Sdk.ZeroExV4.Addresses.Exchange[chainId], true);

      const builder = new Sdk.ZeroExV4.Builders.SingleToken(chainId);

      // Build sell order
      const sellOrder = builder.build({
        direction: "sell",
        maker: seller3.address,
        contract: erc1155.address,
        tokenId: tokenId3,
        amount: totalAmount3,
        fees: [
          {
            recipient: deployer.address,
            amount: fee3,
          },
        ],
        paymentToken: Sdk.ZeroExV4.Addresses.Eth[chainId],
        price: price3,
        expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
      });
      await sellOrder.sign(seller3);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "zeroex-v4",
        contractKind: "erc1155",
        contract: erc1155.address,
        tokenId: tokenId3.toString(),
        amount: amount3,
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
        price: price3.toString(),
      });
    }

    const feeRecipientEthBalanceBefore = await feeRecipient.getBalance();
    const seller1EthBalanceBefore = await seller1.getBalance();
    const seller3EthBalanceBefore = await seller3.getBalance();
    const token1OwnerBefore = await erc721.ownerOf(tokenId1);
    const token3BuyerBalanceBefore = await erc1155.balanceOf(buyer.address, tokenId3);
    expect(token1OwnerBefore).to.eq(seller1.address);
    expect(token3BuyerBalanceBefore).to.eq(0);

    const feesOnTop = [
      {
        recipient: feeRecipient.address,
        amount: parseEther("0.03"),
      },
    ];

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);

    const {
      txs: [{ txData }],
    } = await router.fillListingsTx(listings, buyer.address, Sdk.Common.Addresses.Eth[chainId], {
      source: "reservoir.market",
      globalFees: feesOnTop,
    });
    await buyer.sendTransaction(txData);

    const feeRecipientEthBalanceAfter = await feeRecipient.getBalance();
    const seller1EthBalanceAfter = await seller1.getBalance();
    const seller3EthBalanceAfter = await seller3.getBalance();
    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    const token3BuyerBalanceAfter = await erc1155.balanceOf(buyer.address, tokenId3);

    expect(feeRecipientEthBalanceAfter.sub(feeRecipientEthBalanceBefore)).to.eq(
      feesOnTop.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b))
    );

    expect(seller1EthBalanceAfter.sub(seller1EthBalanceBefore)).to.eq(
      price1.sub(price1.mul(fee1).div(10000))
    );
    expect(seller3EthBalanceAfter.sub(seller3EthBalanceBefore)).to.eq(
      price3
        .mul(amount3)
        .add(totalAmount3 + 1)
        .div(totalAmount3)
    );
    expect(token1OwnerAfter).to.eq(buyer.address);
    expect(token3BuyerBalanceAfter).to.eq(amount3);

    // Router is stateless (it shouldn't keep any funds)
    expect(await ethers.provider.getBalance(router.contracts.router.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.zeroExV4Module.address)).to.eq(0);
  });

  it("Fill multiple listings with skipped reverts", async () => {
    const buyer = dan;

    const listings: ListingDetails[] = [];

    // Order 1: Seaport
    const seller1 = alice;
    const tokenId1 = 0;
    const price1 = parseEther("1");
    const fee1 = bn(550);
    {
      // Mint erc721 to seller
      await erc721.connect(seller1).mint(tokenId1);

      // Approve the exchange
      await erc721
        .connect(seller1)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller1.address,
          contract: erc721.address,
          tokenId: tokenId1,
          paymentToken: Sdk.Common.Addresses.Eth[chainId],
          price: price1.sub(price1.mul(fee1).div(10000)),
          fees: [
            {
              amount: price1.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller1);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
        price: price1.toString(),
      });

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
        price: price1.toString(),
      });
    }

    const feeRecipientEthBalanceBefore = await feeRecipient.getBalance();
    const seller1EthBalanceBefore = await seller1.getBalance();
    const token1OwnerBefore = await erc721.ownerOf(tokenId1);
    expect(token1OwnerBefore).to.eq(seller1.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const feesOnTop = [
      {
        recipient: feeRecipient.address,
        amount: parseEther("0.03"),
      },
    ];

    const nonPartialTx = await router.fillListingsTx(
      listings,
      buyer.address,
      Sdk.Common.Addresses.Eth[chainId],
      {
        source: "reservoir.market",
        globalFees: feesOnTop,
      }
    );

    await expect(buyer.sendTransaction(nonPartialTx.txs[0].txData)).to.be.revertedWith(
      "reverted with custom error 'UnsuccessfulExecution()'"
    );

    const partialTx = await router.fillListingsTx(
      listings,
      buyer.address,
      Sdk.Common.Addresses.Eth[chainId],
      {
        source: "reservoir.market",
        globalFees: feesOnTop,
        partial: true,
      }
    );
    await buyer.sendTransaction(partialTx.txs[0].txData);

    const feeRecipientEthBalanceAfter = await feeRecipient.getBalance();
    const seller1EthBalanceAfter = await seller1.getBalance();
    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    expect(feeRecipientEthBalanceAfter.sub(feeRecipientEthBalanceBefore)).to.eq(
      feesOnTop
        .map(({ amount }) => bn(amount))
        .reduce((a, b) => a.add(b))
        // The fees get averaged over the number of listings
        .div(2)
    );
    expect(seller1EthBalanceAfter.sub(seller1EthBalanceBefore)).to.eq(
      price1.sub(price1.mul(fee1).div(10000))
    );
    expect(token1OwnerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(await ethers.provider.getBalance(router.contracts.router.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportModule.address)).to.eq(0);
  });

  it("Fill multiple Seaport listings", async () => {
    const buyer = dan;

    const listings: ListingDetails[] = [];

    // Order 1: Seaport
    const seller1 = alice;
    const tokenId1 = 0;
    const price1 = parseEther("1");
    const fee1 = bn(550);
    {
      // Mint erc721 to seller
      await erc721.connect(seller1).mint(tokenId1);

      // Approve the exchange
      await erc721
        .connect(seller1)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller1.address,
          contract: erc721.address,
          tokenId: tokenId1,
          paymentToken: Sdk.Common.Addresses.Eth[chainId],
          price: price1.sub(price1.mul(fee1).div(10000)),
          fees: [
            {
              amount: price1.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller1);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
        price: price1.toString(),
      });
    }

    // Order 2: Seaport
    const seller2 = bob;
    const tokenId2 = 1;
    const price2 = parseEther("1.5");
    const fee2 = bn(150);
    {
      // Mint erc721 to seller
      await erc721.connect(seller2).mint(tokenId2);

      // Approve the exchange
      await erc721
        .connect(seller2)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller2.address,
          contract: erc721.address,
          tokenId: tokenId2,
          paymentToken: Sdk.Common.Addresses.Eth[chainId],
          price: price2.sub(price2.mul(fee2).div(10000)),
          fees: [
            {
              amount: price2.mul(fee2).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller2);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId2.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
        price: price2.toString(),
      });
    }

    // Order 3: Seaport
    const seller3 = carol;
    const tokenId3 = 2;
    const price3 = parseEther("0.11");
    const fee3 = bn(1120);
    {
      // Mint erc721 to seller
      await erc721.connect(seller3).mint(tokenId3);

      // Approve the exchange
      await erc721
        .connect(seller3)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller3.address,
          contract: erc721.address,
          tokenId: tokenId3,
          paymentToken: Sdk.Common.Addresses.Eth[chainId],
          price: price3.sub(price3.mul(fee3).div(10000)),
          fees: [
            {
              amount: price3.mul(fee3).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller3);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId3.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
        price: price3.toString(),
      });
    }

    const seller1EthBalanceBefore = await seller1.getBalance();
    const seller2EthBalanceBefore = await seller2.getBalance();
    const seller3EthBalanceBefore = await seller3.getBalance();
    const token1OwnerBefore = await erc721.ownerOf(tokenId1);
    const token2OwnerBefore = await erc721.ownerOf(tokenId2);
    const token3OwnerBefore = await erc721.ownerOf(tokenId3);

    expect(token1OwnerBefore).to.eq(seller1.address);
    expect(token2OwnerBefore).to.eq(seller2.address);
    expect(token3OwnerBefore).to.eq(seller3.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const tx = await router.fillListingsTx(
      listings,
      buyer.address,
      Sdk.Common.Addresses.Eth[chainId],
      {
        source: "reservoir.market",
      }
    );
    await buyer.sendTransaction(tx.txs[0].txData);

    const seller1EthBalanceAfter = await seller1.getBalance();
    const seller2EthBalanceAfter = await seller2.getBalance();
    const seller3EthBalanceAfter = await seller3.getBalance();
    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    const token2OwnerAfter = await erc721.ownerOf(tokenId2);
    const token3OwnerAfter = await erc721.ownerOf(tokenId3);

    expect(seller1EthBalanceAfter.sub(seller1EthBalanceBefore)).to.eq(
      price1.sub(price1.mul(fee1).div(10000))
    );
    expect(seller2EthBalanceAfter.sub(seller2EthBalanceBefore)).to.eq(
      price2.sub(price2.mul(fee2).div(10000))
    );
    expect(seller3EthBalanceAfter.sub(seller3EthBalanceBefore)).to.eq(
      price3.sub(price3.mul(fee3).div(10000))
    );
    expect(token1OwnerAfter).to.eq(buyer.address);
    expect(token2OwnerAfter).to.eq(buyer.address);
    expect(token3OwnerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(await ethers.provider.getBalance(router.contracts.router.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportModule.address)).to.eq(0);
  });

  it("Fill multiple cross-currency listings with ETH", async () => {
    const buyer = dan;

    const listings: ListingDetails[] = [];

    // Order 1: Seaport ETH
    const seller1 = alice;
    const tokenId1 = 0;
    const price1 = parseEther("1");
    const fee1 = bn(550);
    {
      // Mint erc721 to seller
      await erc721.connect(seller1).mint(tokenId1);

      // Approve the exchange
      await erc721
        .connect(seller1)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller1.address,
          contract: erc721.address,
          tokenId: tokenId1,
          paymentToken: Sdk.Common.Addresses.Eth[chainId],
          price: price1.sub(price1.mul(fee1).div(10000)),
          fees: [
            {
              amount: price1.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller1);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
        price: price1.toString(),
      });
    }

    // Order 2: Seaport V1.4 USDC
    const seller2 = bob;
    const tokenId2 = 1;
    const price2 = parseUnits("1.5", 6);
    const fee2 = bn(150);
    {
      // Mint erc721 to seller
      await erc721.connect(seller2).mint(tokenId2);

      // Approve the exchange
      await erc721
        .connect(seller2)
        .setApprovalForAll(Sdk.SeaportV14.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller2.address,
          contract: erc721.address,
          tokenId: tokenId2,
          paymentToken: Sdk.Common.Addresses.Usdc[chainId],
          price: price2.sub(price2.mul(fee2).div(10000)),
          fees: [
            {
              amount: price2.mul(fee2).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV14.Order
      );
      await sellOrder.sign(seller2);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport-v1.4",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId2.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Usdc[chainId],
        price: price2.toString(),
      });
    }

    // Order 3: Seaport WETH
    const seller3 = carol;
    const tokenId3 = 2;
    const price3 = parseEther("0.11");
    const fee3 = bn(1120);
    {
      // Mint erc721 to seller
      await erc721.connect(seller3).mint(tokenId3);

      // Approve the exchange
      await erc721
        .connect(seller3)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller3.address,
          contract: erc721.address,
          tokenId: tokenId3,
          paymentToken: Sdk.Common.Addresses.Weth[chainId],
          price: price3.sub(price3.mul(fee3).div(10000)),
          fees: [
            {
              amount: price3.mul(fee3).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller3);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId3.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Weth[chainId],
        price: price3.toString(),
      });
    }

    const usdc = new Sdk.Common.Helpers.Erc20(ethers.provider, Sdk.Common.Addresses.Usdc[chainId]);
    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);

    const seller1EthBalanceBefore = await seller1.getBalance();
    const seller2UsdcBalanceBefore = await usdc.getBalance(seller2.address);
    const seller3WethBalanceBefore = await weth.getBalance(seller3.address);
    const token1OwnerBefore = await erc721.ownerOf(tokenId1);
    const token2OwnerBefore = await erc721.ownerOf(tokenId2);
    const token3OwnerBefore = await erc721.ownerOf(tokenId3);

    expect(token1OwnerBefore).to.eq(seller1.address);
    expect(token2OwnerBefore).to.eq(seller2.address);
    expect(token3OwnerBefore).to.eq(seller3.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);

    const tx = await router.fillListingsTx(
      listings,
      buyer.address,
      Sdk.Common.Addresses.Eth[chainId],
      {
        source: "reservoir.market",
      }
    );

    await buyer.sendTransaction(tx.txs[0].txData);

    const seller1EthBalanceAfter = await seller1.getBalance();
    const seller2UsdcBalanceAfter = await usdc.getBalance(seller2.address);
    const seller3WethBalanceAfter = await weth.getBalance(seller3.address);
    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    const token2OwnerAfter = await erc721.ownerOf(tokenId2);
    const token3OwnerAfter = await erc721.ownerOf(tokenId3);

    expect(seller1EthBalanceAfter.sub(seller1EthBalanceBefore)).to.eq(
      price1.sub(price1.mul(fee1).div(10000))
    );
    expect(seller2UsdcBalanceAfter.sub(seller2UsdcBalanceBefore)).to.eq(
      price2.sub(price2.mul(fee2).div(10000))
    );
    expect(seller3WethBalanceAfter.sub(seller3WethBalanceBefore)).to.eq(
      price3.sub(price3.mul(fee3).div(10000))
    );
    expect(token1OwnerAfter).to.eq(buyer.address);
    expect(token2OwnerAfter).to.eq(buyer.address);
    expect(token3OwnerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(await ethers.provider.getBalance(router.contracts.router.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.swapModule.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.swapModule.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.swapModule.address)).to.eq(0);
  });

  it("Fill multiple cross-currency listings with USDC", async () => {
    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);

    // Get some USDC
    const swapExecutions = [
      {
        module: router.contracts.swapModule.address,
        data: router.contracts.swapModule.interface.encodeFunctionData("ethToExactOutput", [
          {
            params: {
              tokenIn: Sdk.Common.Addresses.Weth[chainId],
              tokenOut: Sdk.Common.Addresses.Usdc[chainId],
              fee: 500,
              recipient: router.contracts.swapModule.address,
              amountOut: parseUnits("50000", 6),
              amountInMaximum: parseEther("50"),
              sqrtPriceLimitX96: 0,
            },
            transfers: [
              {
                recipient: dan.address,
                amount: parseUnits("50000", 6),
                toETH: false,
              },
            ],
          },
          dan.address,
        ]),
        // Anything on top should be refunded
        value: parseEther("50"),
      },
    ];
    await router.contracts.router.connect(dan).execute(swapExecutions, {
      value: swapExecutions.map(({ value }) => value).reduce((a, b) => bn(a).add(b)),
    });

    const buyer = dan;

    const listings: ListingDetails[] = [];

    // Order 1: Seaport ETH
    const seller1 = alice;
    const tokenId1 = 0;
    const price1 = parseEther("1");
    const fee1 = bn(550);
    {
      // Mint erc721 to seller
      await erc721.connect(seller1).mint(tokenId1);

      // Approve the exchange
      await erc721
        .connect(seller1)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller1.address,
          contract: erc721.address,
          tokenId: tokenId1,
          paymentToken: Sdk.Common.Addresses.Eth[chainId],
          price: price1.sub(price1.mul(fee1).div(10000)),
          fees: [
            {
              amount: price1.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller1);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
        price: price1.toString(),
      });
    }

    // Order 2: Seaport V1.4 USDC
    const seller2 = bob;
    const tokenId2 = 1;
    const price2 = parseUnits("1.5", 6);
    const fee2 = bn(150);
    {
      // Mint erc721 to seller
      await erc721.connect(seller2).mint(tokenId2);

      // Approve the exchange
      await erc721
        .connect(seller2)
        .setApprovalForAll(Sdk.SeaportV14.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller2.address,
          contract: erc721.address,
          tokenId: tokenId2,
          paymentToken: Sdk.Common.Addresses.Usdc[chainId],
          price: price2.sub(price2.mul(fee2).div(10000)),
          fees: [
            {
              amount: price2.mul(fee2).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV14.Order
      );
      await sellOrder.sign(seller2);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport-v1.4",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId2.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Usdc[chainId],
        price: price2.toString(),
      });
    }

    // Order 4: Seaport ETH
    const seller4 = alice;
    const tokenId4 = 4;
    const price4 = parseEther("1");
    const fee4 = bn(550);
    {
      // Mint erc721 to seller
      await erc721.connect(seller4).mint(tokenId4);

      // Approve the exchange
      await erc721
        .connect(seller4)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller4.address,
          contract: erc721.address,
          tokenId: tokenId4,
          paymentToken: Sdk.Common.Addresses.Weth[chainId],
          price: price4.sub(price4.mul(fee1).div(10000)),
          fees: [
            {
              amount: price4.mul(fee4).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller1);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId4.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Weth[chainId],
        price: price4.toString(),
      });
    }

    const usdc = new Sdk.Common.Helpers.Erc20(ethers.provider, Sdk.Common.Addresses.Usdc[chainId]);
    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);

    const seller1EthBalanceBefore = await seller1.getBalance();
    const seller2UsdcBalanceBefore = await usdc.getBalance(seller2.address);
    const token1OwnerBefore = await erc721.ownerOf(tokenId1);
    const token2OwnerBefore = await erc721.ownerOf(tokenId2);

    expect(token1OwnerBefore).to.eq(seller1.address);
    expect(token2OwnerBefore).to.eq(seller2.address);

    const tx = await router.fillListingsTx(
      listings,
      buyer.address,
      Sdk.Common.Addresses.Usdc[chainId],
      {
        source: "reservoir.market",
      }
    );

    // Trigger approvals
    for (const approval of tx.txs[0].approvals) {
      await buyer.sendTransaction(approval.txData);
    }

    await buyer.sendTransaction(tx.txs[0].txData);

    const seller1EthBalanceAfter = await seller1.getBalance();
    const seller2UsdcBalanceAfter = await usdc.getBalance(seller2.address);

    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    const token2OwnerAfter = await erc721.ownerOf(tokenId2);
    const token4OwnerAfter = await erc721.ownerOf(tokenId4);

    expect(seller1EthBalanceAfter.sub(seller1EthBalanceBefore)).to.eq(
      price1.sub(price1.mul(fee1).div(10000))
    );
    expect(seller2UsdcBalanceAfter.sub(seller2UsdcBalanceBefore)).to.eq(
      price2.sub(price2.mul(fee2).div(10000))
    );
    expect(token1OwnerAfter).to.eq(buyer.address);
    expect(token2OwnerAfter).to.eq(buyer.address);
    expect(token4OwnerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(await ethers.provider.getBalance(router.contracts.router.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.swapModule.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.swapModule.address)).to.eq(0);
  });

  it("Fill multiple bids", async () => {
    const seller = dan;

    const bids: BidDetails[] = [];

    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);

    // Order 1: Seaport WETH
    const buyer1 = alice;
    const tokenId1 = 0;
    const price1 = parseEther("1");
    const fee1 = bn(550);
    {
      // Wrap ETH for buyer
      await weth.deposit(buyer1, price1);
      await weth.approve(buyer1, Sdk.SeaportV11.Addresses.Exchange[chainId]);

      // Mint erc721 to seller
      await erc721.connect(seller).mint(tokenId1);

      // Approve the exchange
      await erc721
        .connect(seller)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const buyOrder = builder.build(
        {
          side: "buy",
          tokenKind: "erc721",
          offerer: buyer1.address,
          contract: erc721.address,
          tokenId: tokenId1,
          paymentToken: Sdk.Common.Addresses.Weth[chainId],
          price: price1,
          fees: [
            {
              amount: price1.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await buyOrder.sign(buyer1);

      bids.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: buyOrder,
        price: price1.toString(),
      });
    }

    // Order 2: Seaport V1.4 WETH
    const buyer2 = bob;
    const tokenId2 = 1;
    const price2 = parseEther("0.5");
    const fee2 = bn(250);
    {
      // Wrap ETH for buyer
      await weth.deposit(buyer2, price2);
      await weth.approve(buyer2, Sdk.SeaportV14.Addresses.Exchange[chainId]);

      // Mint erc721 to seller
      await erc721.connect(seller).mint(tokenId2);

      // Approve the exchange
      await erc721
        .connect(seller)
        .setApprovalForAll(Sdk.SeaportV14.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const buyOrder = builder.build(
        {
          side: "buy",
          tokenKind: "erc721",
          offerer: buyer2.address,
          contract: erc721.address,
          tokenId: tokenId2,
          paymentToken: Sdk.Common.Addresses.Weth[chainId],
          price: price2,
          fees: [
            {
              amount: price2.mul(fee2).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV14.Order
      );
      await buyOrder.sign(buyer2);

      bids.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport-v1.4",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId2.toString(),
        order: buyOrder,
        price: price2.toString(),
      });
    }

    const sellerWethBalanceBefore = await weth.getBalance(seller.address);
    const token1OwnerBefore = await erc721.ownerOf(tokenId1);
    const token2OwnerBefore = await erc721.ownerOf(tokenId2);

    expect(token1OwnerBefore).to.eq(seller.address);
    expect(token2OwnerBefore).to.eq(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);

    const tx = await router.fillBidsTx(bids, seller.address, {
      source: "reservoir.market",
    });

    // Trigger approvals
    for (const approval of tx.txs[0].approvals) {
      await seller.sendTransaction(approval.txData);
    }

    await seller.sendTransaction(tx.txs[0].txData);

    const sellerWethBalanceAfter = await weth.getBalance(seller.address);
    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    const token2OwnerAfter = await erc721.ownerOf(tokenId2);

    expect(sellerWethBalanceAfter.sub(sellerWethBalanceBefore)).to.eq(
      price1.sub(price1.mul(fee1).div(10000)).add(price2.sub(price2.mul(fee2).div(10000)))
    );
    expect(token1OwnerAfter).to.eq(buyer1.address);
    expect(token2OwnerAfter).to.eq(buyer2.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(await ethers.provider.getBalance(router.contracts.router.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.router.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
  });

  it("Fill multiple bids with skipped reverts", async () => {
    const seller = dan;

    const bids: BidDetails[] = [];

    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);

    // Order 1: Seaport WETH
    const buyer1 = alice;
    const tokenId1 = 0;
    const price1 = parseEther("1");
    const fee1 = bn(550);
    {
      // Wrap ETH for buyer
      await weth.deposit(buyer1, price1);
      await weth.approve(buyer1, Sdk.SeaportV11.Addresses.Exchange[chainId]);

      // Mint erc721 to seller
      await erc721.connect(seller).mint(tokenId1);

      // Approve the exchange
      await erc721
        .connect(seller)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const buyOrder = builder.build(
        {
          side: "buy",
          tokenKind: "erc721",
          offerer: buyer1.address,
          contract: erc721.address,
          tokenId: tokenId1,
          paymentToken: Sdk.Common.Addresses.Weth[chainId],
          price: price1,
          fees: [
            {
              amount: price1.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await buyOrder.sign(buyer1);

      bids.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: buyOrder,
        price: price1.toString(),
      });
    }

    // Order 2: Seaport V1.4 WETH
    const buyer2 = bob;
    const tokenId2 = 1;
    const price2 = parseEther("0.5");
    const fee2 = bn(250);
    {
      // Wrap ETH for buyer
      await weth.deposit(buyer2, price2);
      await weth.approve(buyer2, Sdk.SeaportV14.Addresses.Exchange[chainId]);

      // Mint erc721 to seller
      await erc721.connect(seller).mint(tokenId2);

      // Approve the exchange
      await erc721
        .connect(seller)
        .setApprovalForAll(Sdk.SeaportV14.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const buyOrder = builder.build(
        {
          side: "buy",
          tokenKind: "erc721",
          offerer: buyer2.address,
          contract: erc721.address,
          tokenId: tokenId2,
          paymentToken: Sdk.Common.Addresses.Weth[chainId],
          price: price2,
          fees: [
            {
              amount: price2.mul(fee2).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV14.Order
      );
      await buyOrder.sign(buyer2);

      bids.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport-v1.4",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId2.toString(),
        order: buyOrder,
        price: price2.toString(),
      });
    }

    // Order 3: Seaport WETH
    const buyer3 = carol;
    const tokenId3 = 2;
    const price3 = parseEther("0.253");
    const fee3 = bn(100);
    {
      // Wrap ETH for buyer
      await weth.deposit(buyer3, price3);
      await weth.approve(buyer3, Sdk.SeaportV11.Addresses.Exchange[chainId]);

      // Mint erc721 to seller
      await erc721.connect(seller).mint(tokenId3);

      // Approve the exchange
      await erc721
        .connect(seller)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const buyOrder = builder.build(
        {
          side: "buy",
          tokenKind: "erc721",
          offerer: buyer3.address,
          contract: erc721.address,
          tokenId: tokenId3,
          paymentToken: Sdk.Common.Addresses.Weth[chainId],
          price: price3,
          fees: [
            {
              amount: price3.mul(fee3).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await buyOrder.sign(buyer3);

      bids.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId3.toString(),
        order: buyOrder,
        price: price3.toString(),
      });

      await new Sdk.SeaportV11.Exchange(chainId).cancelOrder(buyer3, buyOrder);
    }

    const sellerWethBalanceBefore = await weth.getBalance(seller.address);
    const token1OwnerBefore = await erc721.ownerOf(tokenId1);
    const token2OwnerBefore = await erc721.ownerOf(tokenId2);
    const token3OwnerBefore = await erc721.ownerOf(tokenId3);

    expect(token1OwnerBefore).to.eq(seller.address);
    expect(token2OwnerBefore).to.eq(seller.address);
    expect(token3OwnerBefore).to.eq(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);

    {
      const nonPartialTx = await router.fillBidsTx(bids, seller.address, {
        source: "reservoir.market",
      });

      // Trigger approvals
      for (const approval of nonPartialTx.txs[0].approvals) {
        await seller.sendTransaction(approval.txData);
      }

      await expect(seller.sendTransaction(nonPartialTx.txs[0].txData)).to.be.revertedWith(
        "reverted with custom error 'UnsuccessfulExecution()'"
      );
    }

    const { txs } = await router.fillBidsTx(bids, seller.address, {
      source: "reservoir.market",
      partial: true,
    });

    for (const partialTx of txs) {
      // Trigger approvals
      for (const approval of partialTx.approvals) {
        await seller.sendTransaction(approval.txData);
      }

      await seller.sendTransaction(partialTx.txData);
    }

    const sellerWethBalanceAfter = await weth.getBalance(seller.address);
    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    const token2OwnerAfter = await erc721.ownerOf(tokenId2);
    const token3OwnerAfter = await erc721.ownerOf(tokenId3);

    expect(sellerWethBalanceAfter.sub(sellerWethBalanceBefore)).to.eq(
      price1.sub(price1.mul(fee1).div(10000)).add(price2.sub(price2.mul(fee2).div(10000)))
    );
    expect(token1OwnerAfter).to.eq(buyer1.address);
    expect(token2OwnerAfter).to.eq(buyer2.address);
    expect(token3OwnerAfter).to.eq(seller.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(await ethers.provider.getBalance(router.contracts.router.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.router.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
  });

  it("Fill single bid with approval proxy", async () => {
    const seller = dan;

    const bids: BidDetails[] = [];

    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);

    // Order 1: Seaport WETH
    const buyer1 = alice;
    const tokenId1 = 0;
    const price1 = parseEther("1");
    const fee1 = bn(550);
    {
      // Wrap ETH for buyer
      await weth.deposit(buyer1, price1);
      await weth.approve(buyer1, Sdk.SeaportV11.Addresses.Exchange[chainId]);

      // Mint erc721 to seller
      await erc721.connect(seller).mint(tokenId1);

      // Approve the exchange
      await erc721
        .connect(seller)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const buyOrder = builder.build(
        {
          side: "buy",
          tokenKind: "erc721",
          offerer: buyer1.address,
          contract: erc721.address,
          tokenId: tokenId1,
          paymentToken: Sdk.Common.Addresses.Weth[chainId],
          price: price1,
          fees: [
            {
              amount: price1.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await buyOrder.sign(buyer1);

      bids.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: buyOrder,
        price: price1.toString(),
      });
    }

    const sellerWethBalanceBefore = await weth.getBalance(seller.address);
    const token1OwnerBefore = await erc721.ownerOf(tokenId1);

    expect(token1OwnerBefore).to.eq(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);

    const { txs } = await router.fillBidsTx(bids, seller.address, {
      source: "reservoir.market",
      forceApprovalProxy: true,
    });

    for (const tx of txs) {
      // Trigger approvals
      for (const approval of tx.approvals) {
        await seller.sendTransaction(approval.txData);
      }
      await seller.sendTransaction(tx.txData);
    }

    const sellerWethBalanceAfter = await weth.getBalance(seller.address);
    const token1OwnerAfter = await erc721.ownerOf(tokenId1);

    expect(sellerWethBalanceAfter.sub(sellerWethBalanceBefore)).to.eq(
      price1.sub(price1.mul(fee1).div(10000))
    );
    expect(token1OwnerAfter).to.eq(buyer1.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(await ethers.provider.getBalance(router.contracts.router.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.router.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
  });

  it("Fill multiple listings with USDC permits", async () => {
    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);

    // Get some USDC
    const swapExecutions = [
      {
        module: router.contracts.swapModule.address,
        data: router.contracts.swapModule.interface.encodeFunctionData("ethToExactOutput", [
          {
            params: {
              tokenIn: Sdk.Common.Addresses.Weth[chainId],
              tokenOut: Sdk.Common.Addresses.Usdc[chainId],
              fee: 500,
              recipient: router.contracts.swapModule.address,
              amountOut: parseUnits("50000", 6),
              amountInMaximum: parseEther("50"),
              sqrtPriceLimitX96: 0,
            },
            transfers: [
              {
                recipient: dan.address,
                amount: parseUnits("50000", 6),
                toETH: false,
              },
            ],
          },
          dan.address,
        ]),
        // Anything on top should be refunded
        value: parseEther("50"),
      },
    ];
    await router.contracts.router.connect(dan).execute(swapExecutions, {
      value: swapExecutions.map(({ value }) => value).reduce((a, b) => bn(a).add(b)),
    });

    const buyer = dan;

    const listings: ListingDetails[] = [];

    // Order 1: Seaport ETH
    const seller1 = alice;
    const tokenId1 = 0;
    const price1 = parseEther("1");
    const fee1 = bn(550);
    {
      // Mint erc721 to seller
      await erc721.connect(seller1).mint(tokenId1);

      // Approve the exchange
      await erc721
        .connect(seller1)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller1.address,
          contract: erc721.address,
          tokenId: tokenId1,
          paymentToken: Sdk.Common.Addresses.Eth[chainId],
          price: price1.sub(price1.mul(fee1).div(10000)),
          fees: [
            {
              amount: price1.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller1);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
        price: price1.toString(),
      });
    }

    // Order 2: Seaport ETH
    const seller2 = alice;
    const tokenId2 = 4;
    const price2 = parseEther("1");
    const fee2 = bn(550);
    {
      // Mint erc721 to seller
      await erc721.connect(seller2).mint(tokenId2);

      // Approve the exchange
      await erc721
        .connect(seller2)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller2.address,
          contract: erc721.address,
          tokenId: tokenId2,
          paymentToken: Sdk.Common.Addresses.Weth[chainId],
          price: price2.sub(price2.mul(fee1).div(10000)),
          fees: [
            {
              amount: price2.mul(fee2).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller1);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId2.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Weth[chainId],
        price: price2.toString(),
      });
    }

    const usdc = new Sdk.Common.Helpers.Erc20(ethers.provider, Sdk.Common.Addresses.Usdc[chainId]);
    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);

    const seller1EthBalanceBefore = await seller1.getBalance();
    const token1OwnerBefore = await erc721.ownerOf(tokenId1);

    expect(token1OwnerBefore).to.eq(seller1.address);

    const tx = await router.fillListingsTx(
      listings,
      buyer.address,
      Sdk.Common.Addresses.Usdc[chainId],
      {
        source: "reservoir.market",
        usePermit: true,
      }
    );

    // Sign permit
    const { data: permit } = tx.txs[0].permits[0];
    const permitHandler = new PermitHandler(chainId, ethers.provider);
    const signatureData = await permitHandler.getSignatureData(permit);
    const signature = await buyer._signTypedData(
      signatureData.domain,
      signatureData.types,
      signatureData.value
    );
    await permitHandler.attachAndCheckSignature(permit, signature);

    const txData = permitHandler.attachToRouterExecution(tx.txs[0].txData, [permit]);
    await buyer.sendTransaction(txData);

    const seller1EthBalanceAfter = await seller1.getBalance();

    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    const token4OwnerAfter = await erc721.ownerOf(tokenId2);

    expect(seller1EthBalanceAfter.sub(seller1EthBalanceBefore)).to.eq(
      price1.sub(price1.mul(fee1).div(10000))
    );

    expect(token1OwnerAfter).to.eq(buyer.address);
    expect(token4OwnerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(await ethers.provider.getBalance(router.contracts.router.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.swapModule.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.swapModule.address)).to.eq(0);
  });

  it("Fill multiple cross-currency listings with USDC - 1inch", async () => {
    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);

    // Get some USDC
    const swapExecutions = [
      {
        module: router.contracts.swapModule.address,
        data: router.contracts.swapModule.interface.encodeFunctionData("ethToExactOutput", [
          {
            params: {
              tokenIn: Sdk.Common.Addresses.Weth[chainId],
              tokenOut: Sdk.Common.Addresses.Usdc[chainId],
              fee: 500,
              recipient: router.contracts.swapModule.address,
              amountOut: parseUnits("50000", 6),
              amountInMaximum: parseEther("50"),
              sqrtPriceLimitX96: 0,
            },
            transfers: [
              {
                recipient: dan.address,
                amount: parseUnits("50000", 6),
                toETH: false,
              },
            ],
          },
          dan.address,
        ]),
        // Anything on top should be refunded
        value: parseEther("50"),
      },
    ];
    await router.contracts.router.connect(dan).execute(swapExecutions, {
      value: swapExecutions.map(({ value }) => value).reduce((a, b) => bn(a).add(b)),
    });

    const buyer = dan;

    const listings: ListingDetails[] = [];

    // Order 1: Seaport ETH
    const seller1 = alice;
    const tokenId1 = 0;
    const price1 = parseEther("1");
    const fee1 = bn(550);
    {
      // Mint erc721 to seller
      await erc721.connect(seller1).mint(tokenId1);

      // Approve the exchange
      await erc721
        .connect(seller1)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller1.address,
          contract: erc721.address,
          tokenId: tokenId1,
          paymentToken: Sdk.Common.Addresses.Eth[chainId],
          price: price1.sub(price1.mul(fee1).div(10000)),
          fees: [
            {
              amount: price1.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller1);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
        price: price1.toString(),
      });
    }

    // Order 2: Seaport V1.4 USDC
    const seller2 = bob;
    const tokenId2 = 1;
    const price2 = parseUnits("1.5", 6);
    const fee2 = bn(150);
    {
      // Mint erc721 to seller
      await erc721.connect(seller2).mint(tokenId2);

      // Approve the exchange
      await erc721
        .connect(seller2)
        .setApprovalForAll(Sdk.SeaportV14.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller2.address,
          contract: erc721.address,
          tokenId: tokenId2,
          paymentToken: Sdk.Common.Addresses.Usdc[chainId],
          price: price2.sub(price2.mul(fee2).div(10000)),
          fees: [
            {
              amount: price2.mul(fee2).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV14.Order
      );
      await sellOrder.sign(seller2);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport-v1.4",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId2.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Usdc[chainId],
        price: price2.toString(),
      });
    }

    // Order 3: Seaport WETH
    const seller3 = alice;
    const tokenId3 = 4;
    const price3 = parseEther("1");
    const fee3 = bn(550);
    {
      // Mint erc721 to seller
      await erc721.connect(seller3).mint(tokenId3);

      // Approve the exchange
      await erc721
        .connect(seller3)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller3.address,
          contract: erc721.address,
          tokenId: tokenId3,
          paymentToken: Sdk.Common.Addresses.Weth[chainId],
          price: price3.sub(price3.mul(fee1).div(10000)),
          fees: [
            {
              amount: price3.mul(fee3).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller1);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId3.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Weth[chainId],
        price: price3.toString(),
      });
    }

    const usdc = new Sdk.Common.Helpers.Erc20(ethers.provider, Sdk.Common.Addresses.Usdc[chainId]);
    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);

    const seller1EthBalanceBefore = await seller1.getBalance();
    const seller2UsdcBalanceBefore = await usdc.getBalance(seller2.address);
    const token1OwnerBefore = await erc721.ownerOf(tokenId1);
    const token2OwnerBefore = await erc721.ownerOf(tokenId2);

    expect(token1OwnerBefore).to.eq(seller1.address);
    expect(token2OwnerBefore).to.eq(seller2.address);

    const tx = await router.fillListingsTx(
      listings,
      buyer.address,
      Sdk.Common.Addresses.Usdc[chainId],
      {
        source: "reservoir.market",
        swapProvider: "1inch",
      }
    );

    // Trigger approvals
    for (const approval of tx.txs[0].approvals) {
      await buyer.sendTransaction(approval.txData);
    }

    await buyer.sendTransaction(tx.txs[0].txData);

    const seller1EthBalanceAfter = await seller1.getBalance();
    const seller2UsdcBalanceAfter = await usdc.getBalance(seller2.address);

    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    const token2OwnerAfter = await erc721.ownerOf(tokenId2);
    const token3OwnerAfter = await erc721.ownerOf(tokenId3);

    expect(seller1EthBalanceAfter.sub(seller1EthBalanceBefore)).to.eq(
      price1.sub(price1.mul(fee1).div(10000))
    );
    expect(seller2UsdcBalanceAfter.sub(seller2UsdcBalanceBefore)).to.eq(
      price2.sub(price2.mul(fee2).div(10000))
    );
    expect(token1OwnerAfter).to.eq(buyer.address);
    expect(token2OwnerAfter).to.eq(buyer.address);
    expect(token3OwnerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(await ethers.provider.getBalance(router.contracts.router.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.swapModule.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.swapModule.address)).to.eq(0);
  });

  it("Fill multiple cross-currency listings with ETH - 1inch", async () => {
    const buyer = dan;

    const listings: ListingDetails[] = [];

    // Order 1: Seaport ETH
    const seller1 = alice;
    const tokenId1 = 0;
    const price1 = parseEther("1");
    const fee1 = bn(550);
    {
      // Mint erc721 to seller
      await erc721.connect(seller1).mint(tokenId1);

      // Approve the exchange
      await erc721
        .connect(seller1)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller1.address,
          contract: erc721.address,
          tokenId: tokenId1,
          paymentToken: Sdk.Common.Addresses.Eth[chainId],
          price: price1.sub(price1.mul(fee1).div(10000)),
          fees: [
            {
              amount: price1.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller1);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
        price: price1.toString(),
      });
    }

    // Order 2: Seaport V1.4 USDC
    const seller2 = bob;
    const tokenId2 = 1;
    const price2 = parseUnits("1.5", 6);
    const fee2 = bn(150);
    {
      // Mint erc721 to seller
      await erc721.connect(seller2).mint(tokenId2);

      // Approve the exchange
      await erc721
        .connect(seller2)
        .setApprovalForAll(Sdk.SeaportV14.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller2.address,
          contract: erc721.address,
          tokenId: tokenId2,
          paymentToken: Sdk.Common.Addresses.Usdc[chainId],
          price: price2.sub(price2.mul(fee2).div(10000)),
          fees: [
            {
              amount: price2.mul(fee2).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV14.Order
      );
      await sellOrder.sign(seller2);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport-v1.4",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId2.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Usdc[chainId],
        price: price2.toString(),
      });
    }

    // Order 3: Seaport WETH
    const seller3 = carol;
    const tokenId3 = 2;
    const price3 = parseEther("0.11");
    const fee3 = bn(1120);
    {
      // Mint erc721 to seller
      await erc721.connect(seller3).mint(tokenId3);

      // Approve the exchange
      await erc721
        .connect(seller3)
        .setApprovalForAll(Sdk.SeaportV11.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.SeaportBase.Builders.SingleToken(chainId);
      const sellOrder = builder.build(
        {
          side: "sell",
          tokenKind: "erc721",
          offerer: seller3.address,
          contract: erc721.address,
          tokenId: tokenId3,
          paymentToken: Sdk.Common.Addresses.Weth[chainId],
          price: price3.sub(price3.mul(fee3).div(10000)),
          fees: [
            {
              amount: price3.mul(fee3).div(10000),
              recipient: deployer.address,
            },
          ],
          counter: 0,
          startTime: await getCurrentTimestamp(ethers.provider),
          endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        },
        Sdk.SeaportV11.Order
      );
      await sellOrder.sign(seller3);

      await sellOrder.checkFillability(ethers.provider);

      listings.push({
        // Irrelevant
        orderId: "0",
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId3.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Weth[chainId],
        price: price3.toString(),
      });
    }

    const usdc = new Sdk.Common.Helpers.Erc20(ethers.provider, Sdk.Common.Addresses.Usdc[chainId]);
    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);

    const seller1EthBalanceBefore = await seller1.getBalance();
    const seller2UsdcBalanceBefore = await usdc.getBalance(seller2.address);
    const seller3WethBalanceBefore = await weth.getBalance(seller3.address);
    const token1OwnerBefore = await erc721.ownerOf(tokenId1);
    const token2OwnerBefore = await erc721.ownerOf(tokenId2);
    const token3OwnerBefore = await erc721.ownerOf(tokenId3);

    expect(token1OwnerBefore).to.eq(seller1.address);
    expect(token2OwnerBefore).to.eq(seller2.address);
    expect(token3OwnerBefore).to.eq(seller3.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);

    const tx = await router.fillListingsTx(
      listings,
      buyer.address,
      Sdk.Common.Addresses.Eth[chainId],
      {
        source: "reservoir.market",
        swapProvider: "1inch",
      }
    );

    await buyer.sendTransaction({ ...tx.txs[0].txData, gasLimit: 1000000 });

    const seller1EthBalanceAfter = await seller1.getBalance();
    const seller2UsdcBalanceAfter = await usdc.getBalance(seller2.address);
    const seller3WethBalanceAfter = await weth.getBalance(seller3.address);
    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    const token2OwnerAfter = await erc721.ownerOf(tokenId2);
    const token3OwnerAfter = await erc721.ownerOf(tokenId3);

    expect(seller1EthBalanceAfter.sub(seller1EthBalanceBefore)).to.eq(
      price1.sub(price1.mul(fee1).div(10000))
    );
    expect(seller2UsdcBalanceAfter.sub(seller2UsdcBalanceBefore)).to.eq(
      price2.sub(price2.mul(fee2).div(10000))
    );
    expect(seller3WethBalanceAfter.sub(seller3WethBalanceBefore)).to.eq(
      price3.sub(price3.mul(fee3).div(10000))
    );
    expect(token1OwnerAfter).to.eq(buyer.address);
    expect(token2OwnerAfter).to.eq(buyer.address);
    expect(token3OwnerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(await ethers.provider.getBalance(router.contracts.router.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportModule.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.seaportV14Module.address)).to.eq(0);
    expect(await ethers.provider.getBalance(router.contracts.swapModule.address)).to.eq(0);
    expect(await usdc.getBalance(router.contracts.swapModule.address)).to.eq(0);
    expect(await weth.getBalance(router.contracts.swapModule.address)).to.eq(0);
  });
});
