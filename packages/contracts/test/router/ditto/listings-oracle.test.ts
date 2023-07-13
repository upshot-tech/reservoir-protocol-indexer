import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { expect } from "chai";
import abiDittoAppraisal from "../../../../sdk/src/ditto/abis/Appraisal.json";
import abiUpshotOracle from "../../../../sdk/src/ditto/abis/Oracle.json";
import { setupDittoListings } from "../helpers/ditto";

import * as Sdk from "../../../../sdk/src";

/**
 * run with the following command:
 * 
 * BLOCK_NUMBER="9268037" npx hardhat test test/router/ditto/listings-oracle.test.ts
 */
describe("DittoModule", () => {

    let initialTokenBalance: any;
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;

    let nft: Contract;
    let token: Contract;
    let dittoPoolFactory: Contract;
  
    let router: Contract;
    let dittoModule: Contract;

    beforeEach(async () => {

        [deployer] = await ethers.getSigners();

        setupDittoListings().then((contracts) => {
            nft = contracts.nft;
            token = contracts.token;
            dittoPoolFactory = contracts.dittoPoolFactory;
        });

        let adminAddress = "0x00000000000000000000000000000000DeaDBeef";
        alice = await ethers.getImpersonatedSigner(adminAddress); 
        
        initialTokenBalance = "10000000000000000000";

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

    it("Upshot oracle test", async () => {

        const tokenId04 = 4;

        await nft.connect(alice).mint(alice.address, tokenId04);
        await nft.connect(alice).setApprovalForAll(dittoPoolFactory.address, true);
        await token.connect(alice).mint(alice.address, parseEther("100"));
        await token.connect(alice).approve(dittoPoolFactory.address, parseEther("100"));
        let approve = await token.connect(alice).approve(dittoModule.address, parseEther("100"));
        await approve.wait();
        
        await token.balanceOf(alice.address).then((balance: any) => {
            expect(balance).to.equal(parseEther("100"));
        });

        await nft.ownerOf(tokenId04).then((owner: string) => {
            expect(owner).to.equal(alice.address);
        });

        const upshotOracle: Contract = new Contract(
            Sdk.Ditto.Addresses.UpshotOracle[5],
            abiUpshotOracle,
            ethers.provider 
        );
        const authenticatorAddress = await upshotOracle.authenticator();
        const authenticatorSigner: SignerWithAddress = await ethers.getImpersonatedSigner(authenticatorAddress);
        await upshotOracle.connect(authenticatorSigner).setAuthenticator(deployer.address);

        const isPrivatePool: any = false;
        const templateIndex: any = 6; //DittoPoolApp
        const tokenAddress: any = token.address;
        const nftAddress: any = nft.address;
        const feeLp: any = 0;
        const ownerAddress: any = alice.address;
        const feeAdmin: any = 0;
        const delta: any = 0; //NOOP
        const basePrice: any = 0; //NOOP
        const nftIdList: any[] = [tokenId04];
        const initialTokenBalance: any = "1000000000000000000";
        const templateInitData: any = ethers.utils.defaultAbiCoder.encode(["address", "uint256", "uint256"], [Sdk.Ditto.Addresses.UpshotOracle[5], "1", "10000000000000000000"]);
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

        const txn06 = await dittoPoolFactory.connect(deployer).createDittoPool(
            poolTemplate,
            poolManagerTemplate,
            permitterTemplate
        );
        let output = await txn06.wait();  

        const event: any = output.events.find((event: { event: string; }) => event.event === 'DittoPoolFactoryDittoPoolCreated');
        const dpAddress = event.args.dittoPool;

        const dittoPool: Contract = new Contract(
            dpAddress,
            abiDittoAppraisal,
            ethers.provider 
        );

        await token.connect(alice).approve(dittoPool.address, parseEther("100"));
       
        const oracleAddress: any = await dittoPool.oracle();
        expect(oracleAddress).to.eq(Sdk.Ditto.Addresses.UpshotOracle[5]);

        let chainId = 5;
        let nonce = 1;
        let timestamp = 0;
        let expiration = "79228162514264337593543950335"
        let price = "1000000000000000000"
        let messageHash = ethers.utils.solidityKeccak256(
            [
                'uint256',
                'uint256',
                'address',
                'uint256',
                'address',
                'uint256',
                'uint96',
                'uint96'
            ],
            [
                chainId,
                nonce,
                nft.address, 
                tokenId04,
                token.address, 
                price,
                timestamp,
                expiration
            ]
        ); 
        let messageHashBytes = ethers.utils.arrayify(messageHash)
        let flatSig = await deployer.signMessage(messageHashBytes);

        const priceData: any = {
            signature: flatSig,
            nonce: nonce,
            nft: nft.address,
            timestamp: timestamp,
            token: token.address, 
            expiration: expiration,
            nftId: tokenId04,
            price: price
        };

        const swapData = ethers.utils.defaultAbiCoder.encode(
            ['tuple(bytes signature,uint256 nonce,address nft,uint96 timestamp,address token,uint96 expiration,uint256 nftId,uint256 price)[]'],
            [[priceData]]
        );

        const fillTo: string = alice.address;
        const refundTo: string = alice.address;
        const revertIfIncomplete: boolean = false;
        const amountPayment: BigNumber = parseEther("1.2");

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

        const orderParams = [
            [tokenId04],
            swapData
        ];

        const buyWithERC20 = [
            [dittoPool.address],
            [orderParams],
            eRC20ListingParams,
            [fee]
        ];
    
        let data = dittoModule.interface.encodeFunctionData("buyWithERC20", buyWithERC20);

        const executions = [
            dittoModule.address,
            data,
            0
        ];

        await router.execute([executions]);

        await nft.ownerOf(tokenId04).then((owner: any) => {
            expect(owner).to.eq(fillTo);
        });
    
    });

});
