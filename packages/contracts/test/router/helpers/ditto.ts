import { Contract } from "@ethersproject/contracts";
import * as Sdk from "../../../../sdk/src";


import { ethers } from "hardhat";
import NftAbi from "../../../../sdk/src/ditto/abis/Nft.json";


export const setupDittoListings = async () => {

    const chainId = 5; //TODO: getChainId() after mainnet deploy

  

    
    const nft: Contract = new Contract(
      Sdk.Ditto.Addresses.TestNft[chainId],
      NftAbi,
        ethers.provider 
    );
  
    return factory;
};


