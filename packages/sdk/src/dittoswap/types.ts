
/**
 * Definition of the native order formats for the Ditto router contract
 */

export interface NftInSwap {
  pool: string,
  nftIds: string[],
  lpIds?: string[], // required for sell orders
  permitterData?: string, // required for sell orders
  swapData: string
}

export type OrderParams = {
  swapList: NftInSwap[],
  amount: string, // buy = erc20 inputAmount, sell = minOutput erc20 amount
  recipient: string, // buy = nftRecipient, sell = erc20 tokenRecipient
  deadline: number,
  extra: {
    // Array of prices the pool will sell/buy at
    prices: string[]
  }
}

/**
 * Helpers (we may replace these with sdk down the line)
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


