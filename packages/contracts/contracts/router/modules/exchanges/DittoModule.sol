// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IDittoPool} from "../../../interfaces/IDittoPool.sol";

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
            (, , , uint256 price, , ) = pairs[i].getBuyNFTQuote(nftIds[i], 1);
            tokenIds[0] = nftIds[i];

            // Approve the pair if needed
            _approveERC20IfNeeded(params.token, address(pairs[i]), params.amount);

            // Execute fill
            try {

                SwapTokensForNftsArgs memory args = SwapTokensForNftsArgs({
                    nftIds: tokenIds,
                    maxExpectedTokenInput: price,
                    tokenSender: address(this),
                    nftRecipient: params.fillTo,
                    swapData: ""
                });
                
                //uint256[] nftIds; (tokenIds)
                //uint256 maxExpectedTokenInput; (price)
                //address tokenSender;
                //address nftRecipient; (params.fillTo)
                //bytes swapData; 

                pairs[i].swapTokensForNfts(args);

            } catch {
                if (params.revertIfIncomplete) {
                    revert UnsuccessfulFill();
                }
            }

            unchecked {
                ++i;
            }
        }
    }



  // --- ERC721/1155 hooks ---

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

  function onERC1155Received(
    address, // operator
    address, // from
    uint256, // tokenId
    uint256, // amount
    bytes calldata data
  ) external returns (bytes4) {
    if (data.length > 0) {
      _makeCall(router, data, 0);
    }

    return this.onERC1155Received.selector;
  }

  // --- Internal methods ---

  function isERC1155Pair(ISudoswapPairV2.PairVariant vaiant) internal pure returns (bool) {
    return
      ISudoswapPairV2.PairVariant.ERC1155_ERC20 == vaiant ||
      ISudoswapPairV2.PairVariant.ERC1155_ETH == vaiant;
  }

  function isETHPair(ISudoswapPairV2.PairVariant vaiant) internal pure returns (bool) {
    return
      ISudoswapPairV2.PairVariant.ERC721_ETH == vaiant ||
      ISudoswapPairV2.PairVariant.ERC1155_ETH == vaiant;
  }
}