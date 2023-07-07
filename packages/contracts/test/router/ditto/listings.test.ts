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
 * BLOCK_NUMBER="9268037" npx hardhat test test/router/ditto/listings.test.ts
 */
describe("DittoModule", () => {

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

        adminAddress = "0x00000000000000000000000000000000DeaDBeef";
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

    it("Accept multiple listings", async () => {

        const tokenId00 = 1;
        await nft.ownerOf(tokenId00).then((owner: any) => {
            expect(owner).to.eq(poolAddress);
        });
        const tokenId01 = 2;
        await nft.ownerOf(tokenId01).then((owner: any) => {
            expect(owner).to.eq(poolAddress);
        });

        await token.connect(impersonatedSigner).mint(adminAddress, initialTokenBalance);
        await token.balanceOf(adminAddress).then((balance: BigNumber) => {
            expect(balance).to.equal(initialTokenBalance);

        });
        let approve = await token.connect(impersonatedSigner).approve(dittoModule.address, initialTokenBalance);
        await approve.wait();

        // Fetch the current price
        let result = await dittoPool.getBuyNftQuote(2, '0x');
        let inputValue = result[3];

        const fillTo: string = adminAddress;
        const refundTo: string = adminAddress;
        const revertIfIncomplete: boolean = false;
        const tokenAddress: string = token.address;
        const amountPayment: BigNumber = inputValue;

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
            [tokenId00, tokenId01],
            eRC20ListingParams,
            [fee],
            ['0x']
        ];

        let data = dittoModule.interface.encodeFunctionData("buyWithERC20", buyWithERC20);

        const executions = [
            dittoModule.address,
            data,
            0
        ];

        await router.execute([executions]);

        await nft.ownerOf(tokenId00).then((owner: any) => {
            expect(owner).to.eq(fillTo);
        });
        await nft.ownerOf(tokenId01).then((owner: any) => {
            expect(owner).to.eq(fillTo);
        });

    });

});
