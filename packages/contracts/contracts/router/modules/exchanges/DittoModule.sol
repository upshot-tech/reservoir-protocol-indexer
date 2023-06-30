// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "hardhat/console.sol";

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IDittoPool} from "../../../interfaces/IDitto.sol";

//import {CREATE3} from "solmate/src/utils/CREATE3.sol";
import { ERC20 } from "solmate/src/tokens/ERC20.sol";
import { SafeTransferLib } from "solmate/src/utils/SafeTransferLib.sol";

contract DittoModule is BaseExchangeModule {
    using SafeTransferLib for ERC20;
  // --- Constructor ---

  constructor(address owner, address router) BaseModule(owner) BaseExchangeModule(router) {}

    // --- Fallback ---

    receive() external payable {}

    // --- Multiple ERC20 listing ---
        function poolTransferErc20From(
        ERC20 token,
        address from, //0x15aedf98CD01427440232a9B90d091A7782eCF9c 
        address to,
        uint256 amount
    ) external virtual {

      //;

        console.log("                 from -->", address(from));
        console.log("                   to -->", address(to));
        console.log("               amount -->", uint256(amount));
        console.log("                token -->", address(token));
        console.log("                address(this) -->", address(this));
        console.log("token.balanceOf(from) -->", token.balanceOf(from));
        console.log("token.allowance -->", token.allowance(from, address(this)));
        console.log("token.balanceOf(to) -->", uint256(token.balanceOf(to)));

        // transfer tokens to txn sender
        token.safeTransferFrom(from, to, amount);
    }

    function buyWithERC20(
        IDittoPool[] calldata pairs,
        // Token ids for ERC721 pairs, amounts for ERC1155 pairs
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

        // console.log("pairs -->", address(pairs[0]));
        // console.log("nftIds -->", uint256(nftIds[0]));
        // console.log("params.token -->", address(params.token));


        console.log("--- xxx --- ");

        //uint256[] memory tokenIds = new uint256[](1);

        uint256 pairsLength = pairs.length;
        for (uint256 i; i < pairsLength; ) {
            // Fetch the current price
            (
                ,/*uint8 error*/
                ,/*uint256 newSpotPrice*/ 
                ,/*uint256 newDelta*/
                uint256 price, /*uint256 inputAmount*/
                /*uint256 protocolFee*/
            ) = pairs[i].getBuyNftQuote(1, "");
            


            // Approve the pair if needed
            //_approveERC20IfNeeded(params.token, address(pairs[i]), params.amount);

            // Execute fill
            IDittoPool.SwapTokensForNftsArgs memory args = IDittoPool.SwapTokensForNftsArgs({
                nftIds: nftIds,
                maxExpectedTokenInput: price,
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