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



  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc20: Contract;
  let erc721: Contract;
 

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

  });


  it("example method", async () => {

    const factory: Contract = await setupDittoPool();

    console.log("lpNft: ", await factory.lpNft());

    ({ erc20 } = await setupTokens(deployer));
    ({ erc721 } = await setupNFTs(deployer));

    const initialTokenBalance = parseEther("1");

    await erc20.connect(deployer).mint(initialTokenBalance);
    await erc20.balanceOf(deployer.address).then((balance: any) => {
      console.log("balance: ", balance.toString());
    });

    const poolManagerTemplate = [
      "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      new Uint8Array([])
    ];

    const permitterTemplate = [
      "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      new Uint8Array([]),
      new Uint8Array([])
    ];

    const poolTemplate = [
        false, //bool isPrivatePool
        0, //uint256 templateIndex
        erc20.address, //address token
        erc721.address, //address nft
        0, //uint96 feeLp
        deployer.address, //address owner
        0, //uint96 feeAdmin
        parseEther("1.1"), //uint128 delta
        parseEther("1"), //uint128 basePrice
        [], //uint256[] nftIdList
        initialTokenBalance, //uint256 initialTokenBalance
        new Uint8Array([]), //bytes templateInitData
        new Uint8Array([]) //bytes referrer
    ];

    await erc20.connect(deployer).approve(factory.address, initialTokenBalance);

    // Actually deploy the pair
    await factory.connect(deployer).createDittoPool(
      poolTemplate,
      poolManagerTemplate,
      permitterTemplate
    );


    
  });


});
