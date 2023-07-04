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

describe("DittoModule", () => {

    let chainId: number;
    let tokenId: number;

    let poolAddress: string;
    let adminAddress: string;
    let initialTokenBalance: BigNumber;
    let impersonatedSigner: SignerWithAddress;
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    let nft: Contract;
    let token: Contract;
    let dittoPool: Contract;
    let dittoPoolFactory: Contract;
  
    let router: Contract;
    let dittoModule: Contract;

    
    beforeEach(async () => {
        //await setupDittoListings(listings);

        chainId = 5;

        adminAddress = "0x0C19069F36594D93Adfa5794546A8D6A9C1b9e23"; //M1
        impersonatedSigner = await ethers.getImpersonatedSigner(adminAddress); 

        [deployer, alice, bob] = await ethers.getSigners();

        initialTokenBalance = parseEther("1000");

        poolAddress = Sdk.Ditto.Addresses.Pool[chainId];
        
        nft = new Contract(
            Sdk.Ditto.Addresses.Test721[chainId],
            abiErc721,
            ethers.provider 
        );

        token = new Contract(
            Sdk.Ditto.Addresses.Test20[chainId],
            abiErc20,
            ethers.provider 
        );

        dittoPool = new Contract(
            Sdk.Ditto.Addresses.Pool[chainId],
            abiDittoPool,
            ethers.provider 
        );

        dittoPoolFactory = new Contract(
            Sdk.Ditto.Addresses.PoolFactory[chainId],
            abiDittoPoolFactory,
            ethers.provider 
        );

        router = await ethers.getContractFactory("ReservoirV6_0_1", deployer).then((factory) => 
            factory.deploy()
        );

        dittoModule = await ethers.getContractFactory("DittoModule", deployer).then((factory) =>
            factory.deploy(deployer.address, router.address)
        );

        const ownerAddress: string = await dittoPoolFactory.owner();
        const ownerSigner: SignerWithAddress = await ethers.getImpersonatedSigner(ownerAddress);
        await dittoPoolFactory.connect(ownerSigner).addRouters([dittoModule.address]);
    });

    it("Accept single listing", async () => {

        tokenId = 1;

        await nft.ownerOf(tokenId).then((owner: any) => {
            expect(owner).to.eq(poolAddress);
        });

        let balance00: BigNumber = await token.balanceOf(adminAddress);
        await token.connect(impersonatedSigner).mint(adminAddress, initialTokenBalance);
        await token.balanceOf(adminAddress).then((balance01: BigNumber) => {
            expect(balance01).to.equal(balance00.add(initialTokenBalance));
        });

        // let balance00: BigNumber = await token.balanceOf(alice.address);
        // await token.connect(alice).mint(alice.address, initialTokenBalance);
        // await token.balanceOf(alice.address).then((balance01: BigNumber) => {
        //     expect(balance01).to.equal(balance00.add(initialTokenBalance));

        // });
        // let approve = await token.connect(alice).approve(dittoModule.address, initialTokenBalance);
        // await approve.wait();

        //const fillTo: string = alice.address;
        const fillTo: string = adminAddress;
        const refundTo: string = adminAddress;
        const revertIfIncomplete: boolean = false;
        // The ERC20 payment token for the listings
        const tokenAddress: string = token.address;
        // The total amount of `token` to be provided when filling
        const amountPayment: BigNumber = parseEther("2");

        const eRC20ListingParams = [
            fillTo,
            refundTo,
            revertIfIncomplete,
            tokenAddress,
            amountPayment
        ];

        const recipient: string = dittoPool.address;
        const amountFee: BigNumber = parseEther("0");

        const fee = [
            recipient,
            amountFee
        ];


        const buyWithERC20 = [
            [dittoPool.address],
            [tokenId],
            eRC20ListingParams,
            [fee]
        ];

        let data = dittoModule.interface.encodeFunctionData("buyWithERC20", buyWithERC20);

        const executions = [
            dittoModule.address,
            data,
            0
        ];

        await router.connect(impersonatedSigner).execute([executions]);

        await nft.ownerOf(tokenId).then((owner: any) => {
            expect(owner).to.eq(fillTo);
        });

    });

});
