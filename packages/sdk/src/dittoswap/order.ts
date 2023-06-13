import * as Types from "./types";
import { lc, s } from "../utils";

export class Order {
  public chainId: number;
  public params: Types.BuyOrderParams;

  constructor(chainId: number, params: Types.BuyOrderParams) {
    this.chainId = chainId;

    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }
  }
}

const normalize = (order: Types.BuyOrderParams): Types.BuyOrderParams => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings
  return {
    swapList: order.swapList.map((swap) => { return { pool: s(swap.pool), nftIds: swap.nftIds, swapData: s(swap.swapData) }}),
    inputAmount: s(order.inputAmount),
    tokenSender: s(order.tokenSender),
    nftRecipient: s(order.nftRecipient),
    deadline: s(order.deadline)
  };
};