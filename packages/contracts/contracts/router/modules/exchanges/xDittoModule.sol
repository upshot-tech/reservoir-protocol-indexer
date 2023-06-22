// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "hardhat/console.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IDittoPool} from "../../../interfaces/IDitto.sol";

contract xDittoModule is BaseExchangeModule {

    uint256 public counter;

    // --- Constructor ---

    constructor(address owner, address router) BaseModule(owner) BaseExchangeModule(router) {
        counter = 0;
    }

    // --- Fallback ---

    receive() external payable {}

    // --- Multiple ERC20 listing ---

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
        console.log(" -- 00 -- ");

        counter += 1;
    }





}