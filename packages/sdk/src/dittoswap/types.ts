import {
  BytesLike,
  BigNumberish
} from 'ethers'


export type OrderParams = {
  pool: string,
  nftIds: string[],
  lpIds?: string[]
  permitterData?: string
  swapData: string
  inputAmount?: string
  minOutputAmount?: string
  deadline: string
}