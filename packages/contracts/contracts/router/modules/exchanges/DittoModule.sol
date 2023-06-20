// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IDittoPool} from "../../../interfaces/IDitto.sol";

contract DittoModule is BaseExchangeModule {

  // --- Constructor ---

  constructor(address owner, address router) BaseModule(owner) BaseExchangeModule(router) {}

    // --- Fallback ---

    receive() external payable {}

    // --- Multiple ERC20 listing ---

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
        uint256[] memory tokenIds = new uint256[](1);

        uint256 pairsLength = pairs.length;
        for (uint256 i; i < pairsLength; ) {
            // Fetch the current price
            (
                /*uint8 error*/,
                /*uint256 newSpotPrice*/, 
                /*uint256 newDelta*/, 
                uint256 price, // (uint256 inputAmount)
                /*uint256 protocolFee*/
            ) = pairs[i].getBuyNftQuote(1, "");
            tokenIds[0] = nftIds[i];

            // Approve the pair if needed
            _approveERC20IfNeeded(params.token, address(pairs[i]), params.amount);

            // Execute fill
            IDittoPool.SwapTokensForNftsArgs memory args = IDittoPool.SwapTokensForNftsArgs({
                nftIds: tokenIds,
                maxExpectedTokenInput: price,
                tokenSender: address(this),
                nftRecipient: params.fillTo,
                swapData: ""
            }); 

            pairs[i].swapTokensForNfts(args);

            unchecked {
                ++i;
            }
        }
    }



  // --- ERC721 hooks ---

  function onERC721Received(
    address, // operator,
    address, // from
    uint256, // tokenId,
    bytes calldata data
  ) external returns (bytes4) {
    if (data.length > 0) {
      _makeCall(router, data, 0);
    }

    return this.onERC721Received.selector;
  }

}