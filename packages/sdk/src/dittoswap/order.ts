import * as Types from "./types";
import { lc, s, n } from "../utils";

export class Order {
  public chainId: number;
  public params: Types.OrderParams;

  constructor(chainId: number, params: Types.OrderParams) {
    this.chainId = chainId;

    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }
  }
}

const normalize = (order: Types.OrderParams): Types.OrderParams => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings
  return {
    swapList: order.swapList.map((swap) => { 
      return { 
        pool: lc(s(swap.pool)),
        nftIds: swap.nftIds.map(s), 
        swapData: s(swap.swapData),
        lpIds: swap.lpIds ? swap.lpIds.map(s): undefined,
        permitterData: swap.permitterData ? s(swap.permitterData) : undefined
      }}),
    amount: s(order.amount),
    recipient: lc(s(order.recipient)),
    deadline: n(order.deadline),
    extra: {
      prices: order.extra.prices.map(s)
    }
  };
};