import { ChainIdToAddress, Network } from "../utils";

export const PoolFactory: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000000000000000000000000000000000",
  [Network.EthereumGoerli]: "0x967544b2dd5c1c7a459e810c9b60ae4fc8227201",
};
