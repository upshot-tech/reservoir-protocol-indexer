import {
  BytesLike,
  BigNumberish
} from 'ethers'

/**
 * Definition of the native order formats for the Ditto router contract
 */


/**
 * function swapTokensForNfts(Swap[] calldata swapList, uint256 inputAmount, address nftRecipient, uint256 deadline)
*/

export interface Swap {
  pool: string,
  nftIds: string[],
  swapData: string
}

export type BuyOrderParams = {
  swapList: Swap[],
  inputAmount: string,
  tokenSender: string,
  nftRecipient: string,
  deadline: number
}

/*
  function swapNftsForTokens(NftInSwap[] calldata swapList, uint256 minOutput, address tokenRecipient, uint256 deadline)
*/
export interface NftInSwap {
  pool: string,
  nftIds: string[],
  lpIds: string[],
  permitterData: string,
  swapData: string
}

export type SellOrderParams = {
  swapList: NftInSwap[],
  minOutput: string,
  tokenRecipient: string,
  deadline: number
}

/**
 * helpers
 */

export type PriceDataStruct = {
  signature: string;
  nonce: string;
  nft: string;
  timestamp: string;
  token: string;
  expiration: string;
  nftId: string;
  price: string;
};

export interface swapInfoQuery {
  poolAddress: string
  numItems: number
  extraData: PriceDataStruct[]
}

export type FeeStruct = {
  lp: string;
  admin: string;
  protocol: string;
};

export interface NftPriceDataStruct {
  specificNftId: boolean
  nftId: string
  price: string
  fee: FeeStruct
  creatorFee: string
}

export type NftCostData = {
  specificNftId: boolean;
  nftId: string;
  price: string;
  fee: FeeStruct;
};


