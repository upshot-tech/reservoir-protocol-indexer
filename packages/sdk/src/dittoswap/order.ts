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
        pool: lc(swap.pool),
        nftIds: swap.nftIds, 
        swapData: swap.swapData,
        lpIds: swap.lpIds,
        permitterData: swap.permitterData
      }}),
    amount: order.amount,
    recipient: lc(order.recipient),
    deadline: order.deadline
  };
};