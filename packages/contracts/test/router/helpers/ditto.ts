import { Contract } from "@ethersproject/contracts";

import { ethers } from "hardhat";

import * as Sdk from "../../../../sdk/src";
import abiErc20 from "../../../../sdk/src/ditto/abis/Erc20.json";
import abiErc721 from "../../../../sdk/src/ditto/abis/Erc721.json";
import abiDittoPool from "../../../../sdk/src/ditto/abis/Pool.json";
import abiDittoPoolFactory from "../../../../sdk/src/ditto/abis/PoolFactory.json";
import { getChainId } from "../../utils";

export const setupDittoListings = async () => {

    const chainId = getChainId();  
    
    const nft: Contract = new Contract(
        Sdk.Ditto.Addresses.Test721[chainId],
        abiErc721,
        ethers.provider 
    );

    const token: Contract = new Contract(
        Sdk.Ditto.Addresses.Test20[chainId],
        abiErc20,
        ethers.provider 
    );

    const dittoPool: Contract = new Contract(
        Sdk.Ditto.Addresses.Pool[chainId],
        abiDittoPool,
        ethers.provider 
    );

    const dittoPoolFactory: Contract = new Contract(
        Sdk.Ditto.Addresses.PoolFactory[chainId],
        abiDittoPoolFactory,
        ethers.provider 
    );
  
    return {nft, token, dittoPool, dittoPoolFactory};
};


