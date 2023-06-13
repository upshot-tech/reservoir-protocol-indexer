import { Signer } from "@ethersproject/abstract-signer";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, generateSourceBytes } from "../utils";

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
  
  public async fillBuyOrder(
    taker: Signer,
    order: Order,
  ): Promise<ContractTransaction> {
    const tx = this.fillBuyOrderTx(await taker.getAddress(), order);
    return taker.sendTransaction(tx);
  }

  public fillBuyOrderTx(
    taker: string,
    order: Order,
  ): TxData {
    return {
      from: taker,
      to: this.contract.address,
      data:
        this.contract.interface.encodeFunctionData(
          "swapTokensForNfts", [
            order.params.swapList,
            order.params.inputAmount,
            order.params.tokenSender,
            order.params.nftRecipient,
            order.params.inputAmount,
        ]
      )
    }
  };
}