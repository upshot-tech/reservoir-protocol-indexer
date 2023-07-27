export type OrderParams = {
  pool: string;
  nftIds?: string[];
  lpIds?: string[]; // only required for selling
  expectedTokenAmount: string; // buy = erc20 inputAmount, sell = minOutput erc20 amount
  recipient?: string; // buy = nftRecipient, sell = erc20 tokenRecipient
  swapData: string; // defaults to 0x0 (of type bytes)
  permitterData?: string; // only required for selling
  extra: {
    // Array of prices the pool will sell/buy at
    prices: string[];
  };
};
