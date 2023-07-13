// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { console } from "hardhat/console.sol";

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IDittoPool} from "../../../interfaces/IDittoPool.sol";

import { ERC20 } from "solmate/src/tokens/ERC20.sol";
import { SafeTransferLib } from "solmate/src/utils/SafeTransferLib.sol";

struct DittoOrderParams {
  uint256[] nftIds;
  bytes swapData;
}

struct PriceData { 
    bytes signature;
    uint256 nonce;
    address nft; 
    uint96 timestamp;
    address token; 
    uint96 expiration;
    uint256 nftId;
    uint256 price; 
}

interface XXX {
    function soLaLa(bytes calldata swapData_) external;
    function value00() external view returns (PriceData memory);
}

contract DittoModule is BaseExchangeModule {
    using SafeTransferLib for ERC20;
  
    // --- Constructor ---
    constructor(address owner, address router) BaseModule(owner) BaseExchangeModule(router) {}

    // --- Multiple ERC20 listing ---
    function poolTransferErc20From(
      ERC20 token,
      address from,  
      address to,
      uint256 amount
    ) external virtual 
    {
      // transfer tokens to txn sender
      token.safeTransferFrom(from, to, amount);
    }

    function buyWithERC20(
      IDittoPool[] calldata pairs,
      DittoOrderParams[] calldata orderParams,
      ERC20ListingParams calldata params,
      Fee[] calldata fees
    )
    external
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
    {
      uint256 pairsLength = pairs.length;
      for (uint256 i; i < pairsLength; ) {

        // Execute fill
        IDittoPool.SwapTokensForNftsArgs memory args = IDittoPool.SwapTokensForNftsArgs({
          nftIds: orderParams[i].nftIds,
          maxExpectedTokenInput: params.amount,
          tokenSender: params.fillTo,
          nftRecipient: params.fillTo,
          swapData: orderParams[i].swapData
        }); 

        pairs[i].swapTokensForNfts(args);

        unchecked {
          ++i;
        }
      }
    }
  

    function test(DittoOrderParams[] calldata orderParams)
    external
    payable
    {

      console.log(" -- 0 -- ");

      XXX(0x397728d72fd38F565eb554E14Fb29CD59243C9ba).soLaLa(orderParams[0].swapData);

      console.log(" -- 1 -- ");

      PriceData memory pd = XXX(0x397728d72fd38F565eb554E14Fb29CD59243C9ba).value00();

      console.log(" -- 2 -- ");

      console.log(pd.nftId);

      console.log(" -- 3 -- ");

    }



    

}