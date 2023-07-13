import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import { getDittoswapPool, saveDittoswapPool } from "@/models/dittoswap-pools";


export const getPoolDetails = async (address: string) =>
  getDittoswapPool(address).catch(async () => {
    if (Sdk.DittoSwap.Addresses.DittoPoolFactory[config.chainId]) {
      const iface = new Interface([
        "function nft() external view returns (address)",
        "function token() external view returns (address)",
        "function permitter() public view returns (address)",
        "function isPrivatePool() external view returns (bool)",
        "function initialized() external view returns (bool)",
        "function template() external view returns (address)",
        "function fee() public view returns (uint256)",
        "function delta() external view returns (uint128)",
        "function adminFeeRecipient() external view returns (address)"
      ]);

      try {
        const pool = new Contract(address, iface, baseProvider);
        const nft = (await pool.nft()).toLowerCase();
        const token = (await pool.token()).toLowerCase();
        const permitter = (await pool.permitter()).toLowerCase();
        const isPrivatePool = (await pool.isPrivatePool());
        const initialized = (await pool.initialized());
        const template = (await pool.template()).toLowerCase();
        const fee = (await pool.fee());
        const delta = (await pool.delta());
        const adminFeeRecipient = (await pool.adminFeeRecipient()).toLowerCase();

        
        return saveDittoswapPool({
          address,
          nft,
          token,
          permitter,
          isPrivatePool,
          initialized,
          template,
          fee,
          delta,
          adminFeeRecipient
        });
        
      } catch {
        // Skip any errors
      }
    }
  });
