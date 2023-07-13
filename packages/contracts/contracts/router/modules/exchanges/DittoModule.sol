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
  ) 
  external 
  virtual 
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

  // --- Single ERC721 offer ---

  function sell(
    IDittoPool calldata pool,
    DittoOrderParams calldata orderParams,
    uint256 minOutput,
    uint256 deadline,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    IERC721 collection = pool.nft();

    // Build router data
    ICollectionRouter.PoolSwapSpecific[] memory swapList = new ICollectionRouter.PoolSwapSpecific[](
      1
    );
    swapList[0] = ICollectionRouter.PoolSwapSpecific({
      pool: pool,
      nftIds: new uint256[](1),
      proof: orderParams.proof,
      proofFlags: orderParams.proofFlags,
      externalFilterContext: orderParams.externalFilterContext
    });
    swapList[0].nftIds[0] = orderParams.nftId;

    // Execute fill
    try COLLECTION_ROUTER.swapNFTsForToken(swapList, minOutput, address(this), deadline) {
      ICollectionPool.PoolVariant variant = pool.poolVariant();

      // Pay fees
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        uint8(variant) < 2
          ? _sendETH(fee.recipient, fee.amount)
          : _sendERC20(fee.recipient, fee.amount, pool.token());

        unchecked {
          ++i;
        }
      }

      // Forward any left payment to the specified receiver
      uint8(variant) < 2 ? _sendAllETH(params.fillTo) : _sendAllERC20(params.fillTo, pool.token());
    } catch {
      if (params.revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }


  }
  
}