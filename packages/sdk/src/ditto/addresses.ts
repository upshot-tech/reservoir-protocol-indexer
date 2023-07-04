import { ChainIdToAddress, Network } from "../utils";

export const PoolFactory: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000000000000000000000000000000000",
  [Network.EthereumGoerli]: "0x1D0527246ACCe4eA1Ff31F6aa3907d4de00784dD",
};

export const Test721: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000000000000000000000000000000000",
  [Network.EthereumGoerli]: "0x5979F4164A5873f23e354090f0a70bC7a60D0CA1",
};

export const Test20: ChainIdToAddress = {
  [Network.Ethereum]: "0x0000000000000000000000000000000000000000",
  [Network.EthereumGoerli]: "0x4B3B968a56e0354694cc212D8EbB2c3e8944C15B",
};
