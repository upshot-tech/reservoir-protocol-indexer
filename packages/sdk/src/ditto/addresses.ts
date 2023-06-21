import { ChainIdToAddress, Network } from "../utils";

export const PoolFactory: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000000000000000000000000000000000",
  [Network.EthereumGoerli]: "0x1D0527246ACCe4eA1Ff31F6aa3907d4de00784dD",
};
