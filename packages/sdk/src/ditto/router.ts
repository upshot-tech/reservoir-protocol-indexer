import { Signer } from "@ethersproject/abstract-signer";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData } from "../utils";

import RouterAbi from "./abis/DittoRouterRoyalties.json";

// Ditto:
// - fully on-chain
// - pooled liquidity
export class Router {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.DittoPoolRouterRoyalties[this.chainId], RouterAbi);
  }

  // --- TRADING ERC20 TOKENS FOR NFTs

  public async fillBuyOrder(taker: Signer, order: Order): Promise<ContractTransaction> {
    const tx = this.fillBuyOrderTx(await taker.getAddress(), order);
    return taker.sendTransaction(tx);
  }

  public fillBuyOrderTx(
    taker: string,
    order: Order,
    options?: {
      recipient?: string;
    }
  ): TxData {
    return {
      from: taker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("swapTokensForNfts", [
        order.params.nftIds,
        order.params.extra.prices[0] ?? 0,
        options?.recipient ?? taker,
        order.params.swapData ?? "0x0",
      ]),
    };
  }

  public async fillSellOrder(taker: Signer, order: Order): Promise<ContractTransaction> {
    const tx = this.fillSellOrderTx(await taker.getAddress(), order);
    return taker.sendTransaction(tx);
  }

  // --- TRADING NFTs TOKENS FOR ERC20s

  public fillSellOrderTx(
    taker: string,
    order: Order,
    options?: {
      recipient?: string;
    }
  ): TxData {
    return {
      from: taker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("swapNftsForTokens", [
        order.params.nftIds,
        order.params.lpId!,
        order.params.extra.prices[0] ?? 0,
        options?.recipient ?? taker,
        order.params.permitterData ?? "0x0",
        order.params.swapData ?? "0x0",
      ]),
    };
  }
}
