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

    it("Accept multiple listings", async () => {




        const upshotOracle: Contract = new Contract(
            "0x777C02961C97FF2FaD78a86ec6a6d759576dcf0c",
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


        let messageHash = ethers.utils.solidityKeccak256(
            [
                'uint256',
                'bytes',
                'uint256',
                'address',
                'uint96',
                'address',
                'uint96',
                'uint256',
                'uint256'
            ],
            [
                5, //block.chainId
                "0x00",
                1,
                "0x3BcEcaE1a61f53Ead737fBd801C9D9873917e5C6",
                0,
                "0x607702b48528C2883ADF0A24b8A5e1b5988082d6",
                "79228162514264337593543950335",
                4,
                parseEther("1.1")
            ]);
             

        let signature00 = await deployer.signMessage(ethers.utils.arrayify(messageHash));
        console.log("signature00: ", signature00);
        let signature01 = await deployer.signMessage(messageHash);
        console.log("signature01: ", signature01);
        console.log("messageHash: ", ethers.utils.arrayify(messageHash));
        console.log("messageHash: ", messageHash);

        const priceData = {
            signature: "0x00",
            nonce: 1,
            nft: "0x3BcEcaE1a61f53Ead737fBd801C9D9873917e5C6",
            timestamp: 0,
            token: "0x607702b48528C2883ADF0A24b8A5e1b5988082d6",
            expiration: "79228162514264337593543950335",
            nftId: 4,
            price: parseEther("1.1") 
        }
        priceData.signature = signature00;

        

        await upshotOracle.connect(deployer).decodeTokenPrices(
            [priceData]
        );

  


    });

});
