import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ExecutionInfo } from "../helpers/router";

import { setupDittoPool } from "../helpers/ditto";

import {
  bn,
  getRandomBoolean,
  getRandomFloat,
  getRandomInteger,
  setupNFTs,
  setupTokens,
} from "../../utils";

describe("DittoPoolFactory", () => {
  const chainId = 5; //TODO: replace with getChainId() once deployed to mainnet

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let erc20: Contract;
  let erc721: Contract;


  beforeEach(async () => {
    // [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    // ({ erc20 } = await setupTokens(deployer));
    // ({ erc721 } = await setupNFTs(deployer));
  });


  it("example method", async () => {

    const factory: Contract = await setupDittoPool();

    console.log("lpNft: ", await factory.lpNft());

    
  });


});
