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

//ALCHEMY_KEY="" BLOCK_NUMBER="9212320" npx hardhat test test/router/ditto/simple.1.test.ts
describe("DittoPoolFactory", () => {

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let token: Contract;
  let erc721: Contract;

  let initialTokenBalance: any;
 

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    const tokenAddress = "0x8cAa8de40048C4c840014BdEc44373548b61568d";
    const tokenAbi = '[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"spender","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Transfer","type":"event"},{"inputs":[],"name":"DOMAIN_SEPARATOR","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"PERMIT_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"burn","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"mint","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"nonces","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"permit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}]';

    token = new Contract(
        tokenAddress,
        tokenAbi,
        ethers.provider 
    );

    initialTokenBalance = parseEther("10");

    

    await token.connect(deployer).mint(deployer.address, initialTokenBalance);
    await token.balanceOf(deployer.address).then((balance: any) => {
      console.log("balance: ", balance.toString());
    });


  });

  let router: Contract;
  let xDittoModule: Contract;

  it("example method", async () => {

    router = await ethers
    .getContractFactory("ReservoirV6_0_1", deployer)
    .then((factory) => factory.deploy());

    xDittoModule = await ethers
    .getContractFactory("xDittoModule", deployer)
    .then((factory) =>
      factory.deploy(deployer.address, router.address)
    );

    let www0 = await xDittoModule.connect(deployer).counter();
    console.log("www0: ", www0.toString());

    // struct ERC20ListingParams {
    //     address fillTo;
    //     address refundTo;
    //     bool revertIfIncomplete;
    //     // The ERC20 payment token for the listings
    //     IERC20 token;
    //     // The total amount of `token` to be provided when filling
    //     uint256 amount;
    //   }
    const eRC20ListingParams = [
        deployer.address, //address fillTo;
        deployer.address, //address refundTo;
        false, //bool revertIfIncomplete;
        // The ERC20 payment token for the listings
        token.address, //IERC20 token;
        // The total amount of `token` to be provided when filling
        initialTokenBalance //uint256 amount;
    ];
    
    const fee = [
        alice.address, //address recipient;
        parseEther("0.1") //uint256 amount;
    ];

        //  IDittoPool[] calldata pairs,
        // // Token ids for ERC721 pairs, amounts for ERC1155 pairs
        // uint256[] calldata nftIds,
        // ERC20ListingParams calldata params,
        // Fee[] calldata fees
    const buyWithERC20 = [
        [xDittoModule.address], //IDittoPool[] calldata pairs, (pair)...
        [2], //uint256[] calldata nftIds,
        eRC20ListingParams, //ERC20ListingParams calldata params,
        [fee] //Fee[] calldata fees
    ];

    //xDittoModule
    let data = xDittoModule.interface.encodeFunctionData("buyWithERC20", buyWithERC20);

    const executions = [
          xDittoModule.address, //module: 
          data, //data: 
          0//parseEther("5") //value: 
    ];

    // struct ExecutionInfo {
    //     address module;
    //     bytes data;
    //     uint256 value;
    //   }
    await token.connect(deployer).approve(router.address, initialTokenBalance);

    console.log("xDittoModule.address: ", xDittoModule.address);

    await router.connect(deployer).execute([executions]);

    let www1 = await xDittoModule.connect(deployer).counter();
    console.log("www1: ", www1.toString());


  });


});
