// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IDittoPool {

    /**
     * @param nftIds The list of IDs of the NFTs to purchase
     * @param maxExpectedTokenInput The maximum acceptable cost from the sender (in wei or base units of ERC20).
     *   If the actual amount is greater than this value, the transaction will be reverted.
     * @param tokenSender ERC20 sender. Only used if msg.sender is an approved IDittoRouter, else msg.sender is used.
     * @param nftRecipient Address to send the purchased NFTs to.
     */
    struct SwapTokensForNftsArgs {
        uint256[] nftIds;
        uint256 maxExpectedTokenInput;
        address tokenSender;
        address nftRecipient;
        bytes swapData;
    }

    struct NftCostData {
        bool specificNftId;
        uint256 nftId;
        uint256 price;
        Fee fee;
    }

    struct Fee {
        uint256 lp;
        uint256 admin;
        uint256 protocol;
    }

    function getLpNft() external view returns (address);

    function nft() external returns (IERC721);

    function token() external returns (address);

    /**
     * @notice Read-only function used to query the bonding curve for buy pricing info.
     * @param numNfts The number of NFTs to buy out of the pair
     * @param swapData_ Extra data to pass to the curve
     * @return error any errors that would be throw if trying to buy that many NFTs
     * @return newBasePrice the new base price after the trade
     * @return newDelta the new delta after the trade
     * @return inputAmount the amount of token to send to the pool to purchase that many NFTs
     * @return nftCostData the cost data for each NFT purchased
     */
    function getBuyNftQuote(uint256 numNfts, bytes calldata swapData_)
        external
        view
        returns (
            uint8 error,
            uint256 newBasePrice,
            uint256 newDelta,
            uint256 inputAmount,
            NftCostData[] memory nftCostData
        );

    function swapTokensForNfts(
        SwapTokensForNftsArgs calldata args_
    ) external returns (uint256 inputAmount);

}