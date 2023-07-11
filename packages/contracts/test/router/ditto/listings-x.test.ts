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
import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import * as Sdk from "../../../../sdk/src";

/**
 * run with the following command:
 * 
 * BLOCK_NUMBER="9268037" npx hardhat test test/router/ditto/listings.test.ts
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

        const upshotOracle: Contract = new Contract(
            "0xaa6AEEEd815f8b26bE3318Df37A7F8A9d40C48D7",
            abiUpshotOracle,
            ethers.provider 
        );

        let nonce = await upshotOracle.getNonce("0x3BcEcaE1a61f53Ead737fBd801C9D9873917e5C6"); //
        console.log("                       nonce", nonce);
        

        const authenticatorAddress00 = await upshotOracle.authenticator();
        console.log("      authenticatorAddress00", authenticatorAddress00);

        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
        //const wallet = ethers.Wallet.fromMnemonic(process.env.MNEMONIC);
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
            nftId: 4,
            token: "0x607702b48528C2883ADF0A24b8A5e1b5988082d6",
            price: 100,
            timestamp: timestamp, //0,
            expiration: "79228162514264337593543950335"    
        };
        

        let output = await upshotOracle.connect(deployer).decodeTokenPrices(priceData);
        await output.wait();
        
        
        const value00 = await upshotOracle.value00();
        console.log("                     value00", value00);
  


    });

});
