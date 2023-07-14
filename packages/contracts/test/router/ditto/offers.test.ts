import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { expect } from "chai";
import { setupDittoListings } from "../helpers/ditto";
import abiDittoPool from "../../../../sdk/src/ditto/abis/Pool.json";

/**
 * run with the following command:
 * 
 * BLOCK_NUMBER="9268037" npx hardhat test test/router/ditto/offers.test.ts
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

        initialTokenBalance = parseEther("100");

        router = await ethers.getContractFactory("ReservoirV6_0_1", deployer).then((factory) => 
            factory.deploy()
        );

        dittoModule = await ethers.getContractFactory("DittoModule", deployer).then((factory) =>
            factory.deploy(deployer.address, router.address)
        );

    });

    it("Sell an NFT into a pool", async () => {

        const tokenId00 = 13;
        await nft.connect(bob).mint(bob.address, tokenId00);
        await nft.ownerOf(tokenId00).then((owner: any) => {
            expect(owner).to.eq(bob.address);
        });

        await token.connect(alice).mint(alice.address, initialTokenBalance);
        await token.balanceOf(alice.address).then((balance: any) => {
            expect(balance).to.equal(initialTokenBalance);
        });
        await token.connect(alice).approve(dittoPoolFactory.address, initialTokenBalance);
        await token.connect(alice).approve(dittoModule.address, initialTokenBalance);
        
        const isPrivatePool: any = false;
        const templateIndex: any = 3; //DittoPoolLin
        const tokenAddress: any = token.address;
        const nftAddress: any = nft.address;
        const feeLp: any = 0;
        const ownerAddress: any = alice.address;
        const feeAdmin: any = 0;
        const delta: any = parseEther("0.1");
        const basePrice: any = parseEther("1");
        const nftIdList: any[] = [];
        const templateInitData: any = new Uint8Array([]);
        const referrer: any = new Uint8Array([]);

        const poolTemplate: any = {
            isPrivatePool: isPrivatePool,
            templateIndex: templateIndex,
            token: tokenAddress,
            nft: nftAddress,
            feeLp: feeLp,
            owner: ownerAddress,
            feeAdmin: feeAdmin,
            delta: delta,
            basePrice: basePrice,
            nftIdList: nftIdList,
            initialTokenBalance: initialTokenBalance,
            templateInitData: templateInitData,
            referrer: referrer
        };

        const mngrTemplateIndex = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        const mngrInitData = new Uint8Array([]);

        const poolManagerTemplate: any = {
            templateIndex: mngrTemplateIndex,
            templateInitData: mngrInitData
        };

        const permitterTemplateIndex = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        const permitterInitData = new Uint8Array([]);
        const liquidityDepositPermissionData = new Uint8Array([]);

        const permitterTemplate = {
            templateIndex: permitterTemplateIndex,
            templateInitData: permitterInitData,
            liquidityDepositPermissionData: liquidityDepositPermissionData
        };

        const txn = await dittoPoolFactory.connect(deployer).createDittoPool(
            poolTemplate,
            poolManagerTemplate,
            permitterTemplate
        );
        let output = await txn.wait();  

        const event00: any = output.events.find((event: { event: string; }) => event.event === 'DittoPoolFactoryDittoPoolCreated');
        const dpAddress = event00.args.dittoPool;

        const dittoPoolLin: Contract = new Contract(
            dpAddress,
            abiDittoPool,
            ethers.provider 
        );

        let lpId = await dittoPoolLin.getAllPoolLpIds();
        console.log("lpId: " + lpId);

        let result = await dittoPoolLin.getSellNftQuote(1, '0x');
        let outputValue = result[3];
        console.log("inputValue: " + outputValue);

        let args = {
            nftIds: [tokenId00],
            lpIds: [lpId.toString()],
            minExpectedTokenOutput: outputValue,
            nftSender: bob.address,
            tokenRecipient: bob.address,
            permitterData: '0x',
            swapData: '0x'
        };

        await nft.connect(bob).setApprovalForAll(dittoPoolLin.address, true);
        await dittoPoolLin.connect(bob).swapNftsForTokens(args);

        



    });

});
