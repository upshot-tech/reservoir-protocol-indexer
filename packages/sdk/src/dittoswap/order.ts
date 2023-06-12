import * as Types from "./types";
import { lc, s } from "../utils";

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
    pool: lc(order.pool),
    nftIds: order.nftIds.map(s),
    lpIds: order.lpIds ? order.lpIds.map(s) : [],
    permitterData: order.permitterData ? s(order.permitterData) : [],
    swapData: s(order.swapData),
    inputAmount: order.inputAmount ? s(order.inputAmount) : [],
    minOutputAmount: order.minOutputAmount ? s(order.minOutputAmount) : [],
    deadline: s(order.deadline),
  };
};
