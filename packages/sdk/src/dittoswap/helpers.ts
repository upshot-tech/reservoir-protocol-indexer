import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { Provider } from "@ethersproject/abstract-provider";
import { Contract, ContractTransaction } from "@ethersproject/contracts";
import { ethers } from "ethers"
import RouterAbi from "./abis/DittoRouterRoyalties.json";
import PoolAbi from "./abis/DittoPool.json"
import { 
  PriceDataStruct, 
  swapInfoQuery,
  NftPriceDataStruct,
  NftCostData
} from './types';

const abiCoder = ethers.utils.defaultAbiCoder

const encodePriceData = (priceData: PriceDataStruct[]): string =>
  abiCoder.encode(
    [
      'tuple(bytes, uint256, address, uint96, address, uint96, uint256, uint256)[]',
    ],
    [
      priceData.map((pd) => [
        pd.signature,
        pd.nonce,
        pd.nft,
        pd.timestamp,
        pd.token,
        pd.expiration,
        pd.nftId,
        pd.price,
      ]),
    ]
  )

const encodeCostData = async (
  provider: Provider,
  costData: NftCostData[],
  withCreatorRoyalties: boolean,
  nftAddress: string,
  routerAddress: string,
  isBuy: boolean
): Promise<NftCostData[]> =>
  withCreatorRoyalties
    ? await Promise.all(
        costData.map(async (cd: NftCostData) => {
          const totalFees = BigNumber.from(cd.fee.admin)
            .add(cd.fee.lp)
            .add(cd.fee.protocol)

          const salePrice = isBuy
            ? BigNumber.from(cd.price).add(totalFees)
            : BigNumber.from(cd.price).sub(totalFees)

          const router = new Contract(routerAddress, RouterAbi, provider)
          const { royalties } = await router.calculateRoyalties(
            nftAddress,
            salePrice
          )

          return { ...cd, creatorFee: royalties } as NftCostData
        })
      )
    : costData.map((cd) => ({ ...cd, creatorFee: 0 }))


/*
export const getBuyPrices = async (
  provider: Provider,
  buyInfoList: swapInfoQuery[],
  withCreatorRoyalties: boolean
): Promise<
  Array<
    swapInfoQuery & {
      errorCode: number
      errorMessage?: string
      inputAmount: string
      costData: NftPriceDataStruct[]
    }
  >
> =>
  await Promise.all(
    buyInfoList.map(async (buyInfo) => {
      const router = new Contract(routerAddress, RouterAbi, provider)
      const pool = new Contract(buyInfo.poolAddress, PoolAbi, provider)
      const [result, router] = await Promise.all([
        pool.getBuyNftQuote(
          buyInfo.numItems,
          encodePriceData(buyInfo.extraData)
        ),
        router,
      ])

      const costData = await encodeCostData(
        result.nftCostData,
        withCreatorRoyalties,
        await pool.nft(),
        router,
        true
      )

      const errorCode = result.error
      return {
        ...buyInfo,
        errorCode,
        errorMessage: getCurveErrorMessageForErrorCode(errorCode),
        inputAmount: result.inputAmount,
        costData,
      }
    })
  )

export const getSellPrices = async (
  provider: provider,
  sellInfoList: swapInfoQuery[],
  withCreatorRoyalties: boolean
): Promise<
  Array<
    swapInfoQuery & {
      errorCode: number
      errorMessage?: string
      outputAmount: BigNumberish
      costData: NftPriceDataStruct[]
    }
  >
> =>
  await Promise.all(
    sellInfoList.map(async (sellInfo) => {
      const pool = getPool(sellInfo.poolAddress, provider)

      const [result, router] = await Promise.all([
        pool.getSellNftQuote(
          sellInfo.numItems,
          encodePriceData(sellInfo.extraData)
        ),
        getRoyaltyRouter(provider),
      ])

      const costData = await encodeCostData(
        result.nftCostData,
        withCreatorRoyalties,
        await pool.nft(),
        router,
        false
      )

      const errorCode = result.error
      return {
        ...sellInfo,
        errorCode,
        errorMessage: getCurveErrorMessageForErrorCode(errorCode),
        outputAmount: result.outputAmount,
        costData,
      }
    })
  )
*/

const getCurveErrorMessageForErrorCode = (
  errorCode: number
): string | undefined => {
  switch (errorCode) {
    case 1:
      return 'The numItem value is 0 or too large'
    case 2:
      return "The updated base price doesn't fit into 128 bits"
    case 3:
      return "The pool doesn't support selling"
    case 4:
      return "The pool doesn't support buying"
    case 5:
      return 'No swap data provided for a pool that requires it'
    case 6:
      return 'No changes would be made'
    default:
      return undefined
  }
}