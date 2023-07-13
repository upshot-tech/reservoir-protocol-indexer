import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { expect } from "chai";
import abiErc20 from "../../../../sdk/src/ditto/abis/Erc20.json";
import abiErc721 from "../../../../sdk/src/ditto/abis/Erc721.json";
import abiDittoAppraisal from "../../../../sdk/src/ditto/abis/Appraisal.json";
import abiDittoPoolFactory from "../../../../sdk/src/ditto/abis/PoolFactory.json";
import abiUpshotOracle from "../../../../sdk/src/ditto/abis/Oracle.json";

import * as Sdk from "../../../../sdk/src";

/**
 * run with the following command:
 * 
 * BLOCK_NUMBER="9329923" npx hardhat test test/router/ditto/listings-oracle.test.ts
 */
describe("DittoModule", () => {

    let initialTokenBalance: any;
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
  
    let router: Contract;
    let dittoModule: Contract;

    beforeEach(async () => {

        [deployer] = await ethers.getSigners();

        let adminAddress = "0x00000000000000000000000000000000DeaDBeef";
        alice = await ethers.getImpersonatedSigner(adminAddress); 
        

        initialTokenBalance = "10000000000000000000";

        router = await ethers.getContractFactory("ReservoirV6_0_1", deployer).then((factory) => 
            factory.deploy()
        );

        dittoModule = await ethers.getContractFactory("DittoModule", deployer).then((factory) =>
            factory.deploy(deployer.address, router.address)
        );
    });

    it("Accept multiple listings", async () => {

        const tokenId04 = 4;

        const nft: Contract = new Contract(
            //ethers.utils.getAddress("0x5979F4164A5873f23e354090f0a70bC7a60D0CA1"),
            Sdk.Ditto.Addresses.Test721[5],
            abiErc721,
            ethers.provider 
        );
    
        const token: Contract = new Contract(
            //ethers.utils.getAddress("0x3e614639A6F5eA8B3698024031a9CAf211aC45EF"),
            Sdk.Ditto.Addresses.Test20[5],
            abiErc20,
            ethers.provider 
        );

        const dittoPoolFactory: Contract = new Contract(
            Sdk.Ditto.Addresses.PoolFactory[5], 
            abiDittoPoolFactory,
            ethers.provider 
        );

        const ownerAddress00: string = await dittoPoolFactory.owner();
        const ownerSigner: SignerWithAddress = await ethers.getImpersonatedSigner(ownerAddress00);
        await dittoPoolFactory.connect(ownerSigner).addRouters([dittoModule.address]);


        
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

        //let ORACLE_ADDRESS = "0xB686C09fD6d9d86C462B82B0b23EF275833805E3";
        let ORACLE_ADDRESS = "0x24D3906675C35590B95c9Cc393ab11619624e840";

        const upshotOracle: Contract = new Contract(
            ORACLE_ADDRESS,
            abiUpshotOracle,
            ethers.provider 
        );
        const authenticatorAddress00 = await upshotOracle.authenticator();
        console.log("authenticatorAddress00", authenticatorAddress00);
        const authenticatorSigner: SignerWithAddress = await ethers.getImpersonatedSigner(authenticatorAddress00);
        await upshotOracle.connect(authenticatorSigner).setAuthenticator(deployer.address);
        const authenticatorAddress01 = await upshotOracle.authenticator();
        console.log("authenticatorAddress01", authenticatorAddress01);
        console.log("      deployer.address", deployer.address);



        const isPrivatePool: any = false;
        const templateIndex: any = 6; //DittoPoolApp
        const tokenAddress: any = token.address; //"0x607702b48528C2883ADF0A24b8A5e1b5988082d6";
        const nftAddress: any = nft.address; //"0x3BcEcaE1a61f53Ead737fBd801C9D9873917e5C6";
        const feeLp: any = 0;
        const ownerAddress: any = alice.address;
        const feeAdmin: any = 0;
        const delta: any = 0; //NOOP
        const basePrice: any = 0; //NOOP
        const nftIdList: any[] = [tokenId04];
        const initialTokenBalance: any = "1000000000000000000";
        const templateInitData: any = ethers.utils.defaultAbiCoder.encode(["address", "uint256", "uint256"], [ORACLE_ADDRESS, "1", "10000000000000000000"]);
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

        console.log("-- A --");
        const txn06 = await dittoPoolFactory.connect(deployer).createDittoPool(
            poolTemplate,
            poolManagerTemplate,
            permitterTemplate
        );
        let output = await txn06.wait();  

        const event: any = output.events.find((event: { event: string; }) => event.event === 'DittoPoolFactoryDittoPoolCreated');
        const dpAddress = event.args.dittoPool;
    
        try {
            console.log(`DittoPoolApp: ${dpAddress}`);
        } catch (err) {
            console.error('Error occurred:', err);
        }

        const dittoPool: Contract = new Contract(
            dpAddress,
            abiDittoAppraisal,
            ethers.provider 
        );

        await token.connect(alice).approve(dittoPool.address, parseEther("100"));
       
        const oracleAddress: any = await dittoPool.oracle();
        console.log("oracleAddress: ", oracleAddress);
        expect(oracleAddress).to.eq(ORACLE_ADDRESS);

        //const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
        //console.log("              wallet.address", wallet.address); 

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
                5, //block.chainId
                1, //data.nonce,
                nft.address, //"0x3BcEcaE1a61f53Ead737fBd801C9D9873917e5C6", //data.nft, 
                tokenId04, //data.nftId, 
                token.address, //"0x607702b48528C2883ADF0A24b8A5e1b5988082d6", //data.token, 
                price, //data.price, 
                timestamp, //0, //data.timestamp,
                expiration //"79228162514264337593543950335", //data.expiration
            ]
        ); 
        let messageHashBytes = ethers.utils.arrayify(messageHash)
        //let flatSig = await wallet.signMessage(messageHashBytes);

        let flatSig = await deployer.signMessage(messageHashBytes);

        const priceData: any = {
            signature: flatSig,
            nonce: 1,
            nft: nft.address, //"0x3BcEcaE1a61f53Ead737fBd801C9D9873917e5C6",
            timestamp: timestamp, //0,
            token: token.address, //"0x607702b48528C2883ADF0A24b8A5e1b5988082d6",
            expiration: "79228162514264337593543950335",
            nftId: 4,
            price: price
        };

        const swapData = ethers.utils.defaultAbiCoder.encode(
            ['tuple(bytes signature,uint256 nonce,address nft,uint96 timestamp,address token,uint96 expiration,uint256 nftId,uint256 price)[]'],
            [[priceData]]
        );

        //console.log("swapData: ", swapData);

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
