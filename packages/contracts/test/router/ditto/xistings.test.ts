import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { expect } from "chai";

//import { setupDittoListings } from "../helpers/ditto";
import * as Sdk from "../../../../sdk/src";
import abiErc20 from "../../../../sdk/src/ditto/abis/Erc20.json";
import abiErc721 from "../../../../sdk/src/ditto/abis/Erc721.json";
import abiDittoPool from "../../../../sdk/src/ditto/abis/Pool.json";
import abiDittoPoolFactory from "../../../../sdk/src/ditto/abis/PoolFactory.json";

describe("DittoPoolFactory", () => {

  let token: Contract;
  let initialTokenBalance: BigNumber;
  let impersonatedSigner: SignerWithAddress;
 
  let deployer: SignerWithAddress;
 
  let tokenAddress: string;
  let dittoPoolLinAddress: string;

  beforeEach(async () => {


    //await setupDittoListings(listings);


  });

  let tokenId: any;
  let nft: Contract;
  let dittoPool: Contract;

  let router: Contract;
  let xDittoModule: Contract;



  it("accept listing", async () => {

    const chainId = 5; //TODO: getChainId() after mainnet deploy

    [deployer] = await ethers.getSigners();

    initialTokenBalance = parseEther("1000");

  
    dittoPoolLinAddress = Sdk.Ditto.Addresses.Pool[chainId];
    impersonatedSigner = await ethers.getImpersonatedSigner("0x0C19069F36594D93Adfa5794546A8D6A9C1b9e23"); //M1

    tokenId = 1;
  
    const nft: Contract = new Contract(
        Sdk.Ditto.Addresses.Test721[chainId],
        abiErc721,
        ethers.provider 
      );

    await nft.ownerOf(tokenId).then((owner: any) => {
        expect(owner).to.eq(dittoPoolLinAddress);
    });

    token = new Contract(
        Sdk.Ditto.Addresses.Test20[chainId],
        abiErc20,
        ethers.provider 
    );

    
    let balance00: BigNumber = await token.balanceOf(impersonatedSigner.address);
    await token.connect(impersonatedSigner).mint(impersonatedSigner.address, initialTokenBalance);
    await token.balanceOf(impersonatedSigner.address).then((balance01: BigNumber) => {
        expect(balance01).to.equal(balance00.add(initialTokenBalance));
        
    });
   


    dittoPool = new Contract(
        Sdk.Ditto.Addresses.Pool[chainId],
        abiDittoPool,
        ethers.provider 
    );

  



    router = await ethers
    .getContractFactory("ReservoirV6_0_1", deployer)
    .then((factory) => factory.deploy());

    xDittoModule = await ethers
    .getContractFactory("DittoModule", deployer)
    .then((factory) =>
      factory.deploy(deployer.address, router.address)
    );


    
   

    const eRC20ListingParams = [
      impersonatedSigner.address, //address fillTo;
      impersonatedSigner.address, //address refundTo;
        false, //bool revertIfIncomplete;
        // The ERC20 payment token for the listings
        token.address, //"0x8cAa8de40048C4c840014BdEc44373548b61568d", //token.address, //IERC20 token;
        // The total amount of `token` to be provided when filling
        parseEther("2") //uint256 amount;
    ];
    
    const fee = [
      dittoPool.address, //address recipient;
        parseEther("0.0") //uint256 amount;
    ];

    
    const buyWithERC20 = [
        [dittoPool.address], //IDittoPool[] calldata pairs, (pair)...
        [tokenId], //uint256[] calldata nftIds,
        eRC20ListingParams, //ERC20ListingParams calldata params,
        [fee] //Fee[] calldata fees
    ];

    //xDittoModule
    let data = xDittoModule.interface.encodeFunctionData("buyWithERC20", buyWithERC20);

    const executions = [
          xDittoModule.address, //module: 
          data, //data: 
          0 //parseEther("5") //value: 
    ];
    
    console.log("             xDittoModule.address: ", xDittoModule.address);


    await token.connect(deployer).approve(xDittoModule.address, initialTokenBalance);
  




const dpf: Contract = new Contract(
  Sdk.Ditto.Addresses.PoolFactory[chainId],
  abiDittoPoolFactory,
  ethers.provider 
);

const owner: SignerWithAddress = await ethers.getImpersonatedSigner("0x15aedf98CD01427440232a9B90d091A7782eCF9c");
await dpf.connect(owner).addRouters([xDittoModule.address]);

    let xxx = await token.connect(impersonatedSigner).approve(xDittoModule.address, initialTokenBalance);
    await xxx.wait();

    await token.connect(impersonatedSigner).allowance(impersonatedSigner.address, xDittoModule.address).then((allowance: any) => {
      console.log("             xxxallowance: ", allowance);
    });

    

    let xxxxxxx = await token.connect(impersonatedSigner).allowance(impersonatedSigner.address, "0x9c23eb4e6a9490af77a5cb1f3d2ba579ad17b1fc");

    console.log("             xxxxxxx: ", xxxxxxx);

    await router.connect(impersonatedSigner).execute([executions]);


    await nft.ownerOf(tokenId).then((owner: any) => {
        console.log("             owner: ", owner);
        console.log("impersonatedSigner: ", impersonatedSigner.address);
        console.log(" dittoPool.address: ", dittoPool.address);
        console.log("  deployer.address: ", deployer.address);
    });


  });




});
