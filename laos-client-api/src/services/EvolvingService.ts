import { EvolveBatchInput, EvolveInput } from "../types/graphql/inputs/EvolveInput";
import { LaosConfig, AssetMetadata, EvolveResult, EvolveBatchResult, EvolveToken } from "../types";
import { EvolveAsyncStatus, EvolveAsyncResponse, EvolveBatchResponse, EvolveStatusResponse, EvolveResponse } from "../types/graphql/outputs/EvolveOutput";
import { ServiceHelper } from "./ServiceHelper";
import ClientService from "./db/ClientService";
import ContractService from "./db/ContractService";

export class EvolvingService {
  private serviceHelper: ServiceHelper;

  constructor() {
    const evolveConfig: LaosConfig = {
      minterPvks: process.env.MINTER_KEYS || '',
      rpcMinter: process.env.RPC_MINTER || '',
    };
    this.serviceHelper = new ServiceHelper(evolveConfig);
  }


  public async evolveBatchResponse(txHash: string): Promise<EvolveStatusResponse> {
    return this.serviceHelper.laosService.evolveBatchResponse(txHash);
  }

  public async evolveBatchAsync(input: EvolveBatchInput, apiKey: string): Promise<EvolveAsyncResponse> {
    const { contractAddress, tokens, chainId } = input;
    try{
      if (!contractAddress) {
        throw new Error('Contract address is required');
      }
      if(!chainId) {
        throw new Error('Chain id is required');
      }
      // retrieve contract from db
      const client = await ClientService.getClientByKey(apiKey);
      const contract = await ContractService.getClientContract(client.id, chainId, contractAddress);
      if (!contract) {
        throw new Error('Contract not found');
      }

      const tokensToEvolve: EvolveToken[] = tokens.map(token => {
        if (token.image && token.image.startsWith("data:image/")) {
          throw new Error(`Invalid image format for tokenId ${token.tokenId}: data URIs are not allowed in batch evolve.`);
        }
        return {
          tokenId: token.tokenId,
          assetMetadata: {
            name: token.name,
            description: token.description || '',
            image: token.image || '',
            attributes: token.attributes || [],
          },
        };
      });
     
      try {
        const result: EvolveBatchResult = await this.serviceHelper.laosService.evolveBatchAsync({
          laosContractAddress: contract.batchMinterContract,
          tokens: tokensToEvolve,
        }, apiKey); 
        if (result.tx) {
          return { 
            tokenIds: result.tokens.map(token => token.tokenId),
            status: EvolveAsyncStatus.PENDING,
            txHash: result.tx,
            message: "Transaction is being submitted to the blockchain"
          };
        } else {
          throw new Error(result.error ?? "Evolving failed");
        }
      } catch (error) {
        throw new Error(`Failed to evolve NFT: ${error}`);
      }

    } catch (error) {
      console.error(`Evolving failed for contract: ${contractAddress} on chainId: ${chainId}`, error);
      throw error;
    }
  }

  public async evolveBatch(input: EvolveBatchInput, apiKey: string): Promise<EvolveBatchResponse> {
    const { contractAddress, tokens, chainId } = input;
    try{
      if (!contractAddress) {
        throw new Error('Contract address is required');
      }
      if(!chainId) {
        throw new Error('Chain id is required');
      }
      // retrieve contract from db
      const client = await ClientService.getClientByKey(apiKey);
      const contract = await ContractService.getClientContract(client.id, chainId, contractAddress);
      if (!contract) {
        throw new Error('Contract not found');
      }

      const tokensToEvolve: EvolveToken[] = tokens.map(token => {
        if (token.image && token.image.startsWith("data:image/")) {
          throw new Error(`Invalid image format for tokenId ${token.tokenId}: data URIs are not allowed in batch evolve.`);
        }
        return {
          tokenId: token.tokenId,
          assetMetadata: {
            name: token.name,
            description: token.description || '',
            image: token.image || '',
            attributes: token.attributes || [],
          },
        };
      });
     
      try {
        const result: EvolveBatchResult = await this.serviceHelper.laosService.evolveBatch({
          laosContractAddress: contract.batchMinterContract,
          tokens: tokensToEvolve,
        }, apiKey); 
        if (result.status === "success") {
          return { 
            tokens: result.tokens.map(token => ({
              tokenId: token.tokenId,
              tokenUri: token.tokenUri,
            })),
            success: true,
            tx: result.tx || ''
          };
        } else {
          throw new Error(result.error ?? "Evolving failed"); // Use nullish coalescing operator
        }
      } catch (error) {
        throw new Error(`Failed to evolve NFT: ${error}`);
      }

    } catch (error) {
      console.error(`Evolving failed for contract: ${contractAddress} on chainId: ${chainId}`, error);
      throw error;
    }
  }



  public async evolve(input: EvolveInput, apiKey: string): Promise<EvolveResponse> {
    const { contractAddress, tokenId, name, description, attributes, image, chainId } = input;
    try{
      if (!contractAddress) {
        throw new Error('Contract address is required');
      }
      if(!chainId) {
        throw new Error('Chain id is required');
      }

      const imageUrl = await this.serviceHelper.handleImageUpload(image || '');
      const parsedAttributes = attributes? attributes : [];

      // retrieve contract from db
      const client = await ClientService.getClientByKey(apiKey);
      const contract = await ContractService.getClientContract(client.id, chainId, contractAddress);
      if (!contract) {
        throw new Error('Contract not found');
      }

      const assetMetadata: AssetMetadata = {
        name: name || '',
        description: description || '',
        image: imageUrl,
        attributes: parsedAttributes, 
      };
      try {
        const result: EvolveBatchResult = await this.serviceHelper.laosService.evolveBatch({
          laosContractAddress: contract.batchMinterContract,
          tokens: [{
            tokenId: tokenId!, 
            assetMetadata, 
          }],
        }, apiKey); 
        if (result.status === "success") {
          return { 
            tokenId: result.tokens[0].tokenId, 
            success: true,
            tokenUri: result.tokens[0].tokenUri,
            tx: result.tx || ''
          };
        } else {
          throw new Error(result.error ?? "Evolving failed"); // Use nullish coalescing operator
        }
      } catch (error) {
        throw new Error(`Failed to evolve NFT: ${error}`);
      }

    } catch (error) {
      console.error(`Evolving failed for contract: ${contractAddress} on chainId: ${chainId} with tokenId: ${tokenId}`, error);
      throw error;
    }
  }
}