import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { expect } from "chai";

import { setupDittoListings } from "../helpers/ditto";

/**
 * run with the following command:
 * 
 * ALCHEMY_KEY="" BLOCK_NUMBER="9268037" npx hardhat test test/router/ditto/listings.test.ts
 */
describe("DittoModule", () => {

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

        setupDittoListings().then((contracts) => {
            nft = contracts.nft;
            token = contracts.token;
            dittoPool = contracts.dittoPool;
            dittoPoolFactory = contracts.dittoPoolFactory;
        });

        adminAddress = "0x0C19069F36594D93Adfa5794546A8D6A9C1b9e23"; //M1
        impersonatedSigner = await ethers.getImpersonatedSigner(adminAddress); 
        poolAddress = dittoPool.address;

        [deployer, alice, bob] = await ethers.getSigners();

        initialTokenBalance = parseEther("1000");

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
