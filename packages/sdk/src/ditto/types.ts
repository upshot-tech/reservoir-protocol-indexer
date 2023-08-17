export type OrderParams = {
  pool: string; // Is pool correct? Should we also have lpId - or if sell comes in lpIds ?
  type?: string;
  nftIds?: string[];
  lpIds: string;
  expectedTokenAmount: string; // buy = erc20 inputAmount, sell = minOutput erc20 amount
  recipient?: string; // buy = nftRecipient, sell = erc20 tokenRecipient
  swapData: string; // defaults to 0x0 (of type bytes)
  permitterData?: string; // only required for selling
  extra: {
    // Array of prices the pool will sell/buy at
    prices: string[];
  };
  // referrer?: string; // TODO add
  // Validation parameters (for ensuring only the latest event is relevant)
  txHash: string;
  txTimestamp: number;
  txBlock: number;
  logIndex: number;
  deadline?: number; // TODO in use?
  // Misc options
  forceRecheck?: boolean;
};
