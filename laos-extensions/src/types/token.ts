interface TokenSupply {
  tokenID: string;
  supply: string;
  chainId: number;
  contractInfo?: ContractInfo;
  tokenMetadata?: TokenMetadata;
}

interface TokenBalance {
  contractType: string;
  contractAddress: string;
  accountAddress: string;
  tokenID: string;
  balance: string;
  blockHash: string;
  blockNumber: number;
  chainId: number;
  isSummary: boolean;
  contractInfo?: ContractInfo;
  tokenMetadata?: TokenMetadata;
}

interface ContractInfo {
  chainId: number;
  address: string;
  name: string;
  type: string;
  symbol: string;
  decimals?: number;
  logoURI?: string;
  deployed: boolean;
  bytecodeHash: string;
  extensions: {
    link: string;
    description: string;
    ogImage: string;
    originChainId: number;
    originAddress: string;
    verified: boolean;
    verifiedBy?: string;
    featured?: boolean;
  };
  contentHash?: number;
  updatedAt: string;
}

interface TokenMetadata {
  tokenId: string;
  name: string;
  description: string;
  image: string;
  properties: Record<string, any>;
  attributes: any;
  external_url: string;
  decimals: number;
  updatedAt: string;
}

interface TokenSuppliesResponse {
  page: {
    after: string;
    pageSize: number;
    more: boolean;
  };
  contractType: string;
  tokenIDs: TokenSupply[];
}

interface TokenBalancesResponse {
  page: {
    after: string;
    pageSize: number;
    more: boolean;
  };
  balances: TokenBalance[];
}

type AttributeIndexer = {
  traitType: string;
  value: string;
}

export interface TokenResponse {
  page?: {
    after: string;
    pageSize?: number;
    more: boolean;
  };
  tokens: TokenIndexer[];
}

type TokenIndexer = {
  contractAddress: string;
  contractName?: string;
  contractSymbol?: string;
  contractBytecodeHash?: string;
  attributes?: AttributeIndexer[];
  tokenId: string;
  image?: string;
  name?: string;
  description?: string;
  owner?: string;
  blockNumber?: number;
  blockHash?: string;
  createdAt?: string;
}

export type GetTokenBalancesQueryInput = {
  chainName: string;
  contractAddress?: string;
  owner: string;
  after?: string;
  first?: number;
  includeMetadata?: boolean;
  orderBy?: string;
}

export type GetTokenSuppliesQueryInput = {
  chainName: string;
  contractAddress?: string;
  after?: string;
  first?: number;
  includeMetadata?: boolean;
  orderBy?: string;
}

export {
  TokenSupply,
  TokenBalance,
  ContractInfo,
  TokenMetadata,
  TokenSuppliesResponse,
  TokenBalancesResponse,
  AttributeIndexer,
  TokenIndexer
};