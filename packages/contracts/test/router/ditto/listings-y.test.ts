import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { expect } from "chai";
import abiErc20 from "../../../../sdk/src/ditto/abis/Erc20.json";
import abiErc721 from "../../../../sdk/src/ditto/abis/Erc721.json";
import abiDittoAppraisal from "../../../../sdk/src/ditto/abis/Appraisal.json";
import abiDittoPool from "../../../../sdk/src/ditto/abis/Pool.json";
import abiUpshotOracle from "../../../../sdk/src/ditto/abis/Oracle.json";
import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import * as Sdk from "../../../../sdk/src";

/**
 DittoPoolApp "0x397728d72fd38F565eb554E14Fb29CD59243C9ba"
 */
describe("DittoModule", () => {

    let initialTokenBalance: any;
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;

    beforeEach(async () => {

        [deployer] = await ethers.getSigners();

        let adminAddress = "0x00000000000000000000000000000000DeaDBeef";
        alice = await ethers.getImpersonatedSigner(adminAddress); 
        
        initialTokenBalance = "10000000000000000000";
    });

    it("x", async () => {

        const dittoPoolApp: Contract = new Contract(
            "0x397728d72fd38F565eb554E14Fb29CD59243C9ba",
            abiDittoPool,
            ethers.provider 
        );

        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
        console.log("              wallet.address", wallet.address); 

        let timestamp = 0;
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
                "0x3BcEcaE1a61f53Ead737fBd801C9D9873917e5C6", //data.nft, 
                4, //data.nftId, 
                "0x607702b48528C2883ADF0A24b8A5e1b5988082d6", //data.token, 
                100, //data.price, 
                timestamp, //0, //data.timestamp,
                "79228162514264337593543950335", //data.expiration
            ]
        ); 
        let messageHashBytes = ethers.utils.arrayify(messageHash)
        let flatSig = await wallet.signMessage(messageHashBytes);

        const priceData: any = {
            signature: flatSig,
            nonce: 1,
            nft: "0x3BcEcaE1a61f53Ead737fBd801C9D9873917e5C6",
            timestamp: timestamp, //0,
            token: "0x607702b48528C2883ADF0A24b8A5e1b5988082d6",
            expiration: "79228162514264337593543950335",
            nftId: 4,
            price: 100
        };

        const swapData = ethers.utils.defaultAbiCoder.encode(
            ['tuple(bytes signature,uint256 nonce,address nft,uint96 timestamp,address token,uint96 expiration,uint256 nftId,uint256 price)[]'],
            [[priceData]]
          );
          
        const xxx = await dittoPoolApp.connect(deployer).soLaLa(swapData);
        let output = await xxx.wait(); 
        const event00: any = output.events.find((event: { event: string; }) => event.event === 'Event00');
        
        console.log("event.args: ", event00.args);
 
        const event01: any = output.events.find((event: { event: string; }) => event.event === 'Event01');
        console.log("event.args: ", event01.args);


    });

});
