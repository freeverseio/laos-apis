import { TransactionReceipt, TransactionResponse } from "ethers";
import { AssetMetadata } from "./asset";

export interface Property {
  [key: string]: string;
}

export interface Trait {
  trait_type: string;
  value: string;
}

export type MintRequestBody = {
  mintTo: string;
  name: string;
  description: string;
  image: string;
  properties: Property[];
};

export interface MintSingleNFTParams {
  laosContractAddress: string;
  to: string;
  assetMetadata: AssetMetadata;
}

export interface BatchMintNFTParams {
  laosBatchMinterContractAddress: string;
  tokens: BatchMintTokenInput[];
}

export interface BatchMintTokenInput {
  tokenUri: string;
  mintTo: string;
}

export interface EvolveNFTParams {
  laosContractAddress: string;
  tokens: EvolveToken[];
}

export interface EvolveToken {
  tokenId: string;
  assetMetadata: AssetMetadata;
}

export interface MintResult {
  status: string;
  tokenId?: string;
  contractAddress?: string;
  tx?: string;
  error?: string;
}

export interface TokenOwners {
  tokenId: string;
  owner: string;
  tokenUri?: string;
}

export interface BatchMintResult {
  status: string;
  numberOfTokens?: number;
  tokenIds?: string[];
  tokens?: TokenOwners[];
  contractAddress?: string;
  tx?: string;
  error?: string;
}

export interface EvolveResult {
  status: string;
  tokenId?: string;
  tokenUri?: string;
  contractAddress?: string;
  tx?: string;
  error?: string;
}

export interface EvolveBatchResult {
  status: string;
  tokens: EvolveTokenResult[];
  tx?: string;
  error?: string;
}



export interface EvolveTokenResult {
  tokenId: string;
  tokenUri: string;
}

export enum TransactionType {
  TRANSACTION = "TransactionResponse",
  RECEIPT = "TransactionReceipt",
  NOT_FOUND = "NOT_FOUND",
}

export interface LaosTransaction {
  tx:   TransactionResponse | null
  receipt: TransactionReceipt | null
  type: TransactionType
}