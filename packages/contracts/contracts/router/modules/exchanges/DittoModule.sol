// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { console } from "hardhat/console.sol";

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IDittoPool} from "../../../interfaces/IDitto.sol";

import { ERC20 } from "solmate/src/tokens/ERC20.sol";
import { SafeTransferLib } from "solmate/src/utils/SafeTransferLib.sol";

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
      uint256[] calldata nftIds,
      ERC20ListingParams calldata params,
      Fee[] calldata fees
    )
    external
    payable
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
    {
      uint256 pairsLength = pairs.length;
      for (uint256 i; i < pairsLength; ) {
      // Fetch the current price
      (
        , // uint8 error
        , // uint256 newSpotPrice 
        , // uint256 newDelta
        uint256 inputAmount, 
        // uint256 protocolFee
      ) = pairs[i].getBuyNftQuote(nftIds.length, "");

      console.log("inputAmount", inputAmount);
      console.log("    address", address(this));

      // Execute fill
      IDittoPool.SwapTokensForNftsArgs memory args = IDittoPool.SwapTokensForNftsArgs({
        nftIds: nftIds,
        maxExpectedTokenInput: inputAmount,
        tokenSender: params.fillTo,
        nftRecipient: params.fillTo,
        swapData: ""
      }); 

      pairs[i].swapTokensForNfts(args);

      unchecked {
        ++i;
      }
    }
  }

}