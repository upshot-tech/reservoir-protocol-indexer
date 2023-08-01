import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";

import { baseProvider } from "@/common/provider";
import { getDittoPool, saveDittoPool } from "@/models/ditto-pools";

export const getPoolDetails = async (address: string) =>
  getDittoPool(address).catch(async () => {
    const iface = new Interface([
      "function nft() external view returns (address)",
      "function token() external view returns (address)",
      "function permitter() public view returns (address)",
      "function isPrivatePool() external view returns (bool)",
      "function initialized() external view returns (bool)",
      "function template() external view returns (address)",
      "function fee() public view returns (uint256)",
      "function delta() external view returns (uint128)",
      "function adminFeeRecipient() external view returns (address)",
    ]);

    try {
      const pool = new Contract(address, iface, baseProvider);
      const nft = (await pool.nft()).toLowerCase();
      const token = (await pool.token()).toLowerCase();
      const permitter = (await pool.permitter()).toLowerCase();
      const isPrivatePool = await pool.isPrivatePool();
      const initialized = await pool.initialized();
      const template = (await pool.template()).toLowerCase();
      const delta = await pool.delta();
      const adminFeeRecipient = (await pool.adminFeeRecipient()).toLowerCase();
      const fee = await pool.fee();

      return saveDittoPool({
        address,
        nft,
        token,
        permitter,
        isPrivatePool,
        initialized,
        template,
        fee,
        delta,
        adminFeeRecipient,
      });
    } catch {
      // Skip any errors
    }
  });
