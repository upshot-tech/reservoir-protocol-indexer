import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import { bn, getChainId } from "../../utils";

//import { setupSudoswapTestContract, addresTokenPDB, addresPoolPDB } from "../helpers/sudoswap";
import FactoryAbi from "../../../../sdk/src/ditto/abis/Factory.json";

// --- Listings ---

export type DittoListing = {
  seller: SignerWithAddress;
  nft: {
    contract: Contract;
    id: number;
  };
  price: BigNumberish;
  // Whether the order is to be cancelled
  isCancelled?: boolean;
  order?: Sdk.SudoswapV2.Order;
};

export const setupDittoListings = async (listings: DittoListing[]) => {
  const chainId = getChainId();

  const factory = new Contract(
    Sdk.SudoswapV2.Addresses.PairFactory[chainId],
    FactoryAbi,
    ethers.provider
  );
  for (const listing of listings) {
    const { seller, nft, price, isCancelled } = listing;

    // Approve the factory contract
    await nft.contract.connect(seller).mint(nft.id);
    await nft.contract
      .connect(seller)
      .setApprovalForAll(Sdk.SudoswapV2.Addresses.PairFactory[chainId], true);

    /*  
    // Get the pair address by making a static call to the deploy method
    const pair = await factory.connect(seller).callStatic.createDittoPool( //returns (IDittoPool dittoPool, uint256 lpId, IPoolManager poolManager, IPermitter permitter)
      nft.contract.address,
      Sdk.SudoswapV2.Addresses.LinearCurve[chainId],
      seller.address,
      1, // NFT
      0,
      0,
      price,
      AddressZero,
      isCancelled ? [] : [nft.id]
    );
    */

    // Actually deploy the pair
    await factory.connect(seller).createPairERC721ETH(
      nft.contract.address,
      Sdk.SudoswapV2.Addresses.LinearCurve[chainId],
      seller.address,
      1, // NFT
      0,
      0,
      price,
      AddressZero,
      isCancelled ? [] : [nft.id]
    );

    listing.order = new Sdk.SudoswapV2.Order(chainId, {
      pair,
      extra: {
        prices: [price.toString()],
      },
    });
  }
};