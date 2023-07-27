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
    pool: s(order.pool),
    nftIds: order.nftIds ? order.nftIds.map(s) : undefined,
    lpIds: order.lpIds ? order.lpIds.map(s) : undefined,
    expectedTokenAmount: s(order.expectedTokenAmount),
    recipient: lc(s(order.recipient)),
    swapData: s(order.swapData),
    extra: {
      prices: order.extra.prices.map(s),
    },
  };
};
