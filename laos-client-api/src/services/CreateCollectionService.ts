//@TODO
import { CreateCollectionInput } from "../types/graphql/inputs/CreateCollectionInput";
import { LaosConfig, OwnershipChainConfig } from "../types";
import { CreateCollectionResponse } from "../types/graphql/outputs/CreateCollectionOutput";
import { ServiceHelper } from "./ServiceHelper";
import ClientService from "./db/ClientService";
import ContractService from "./db/ContractService";
import { OwnershipChainService } from "./blockchain/OwnershipChainService";

export class CreateCollectionService {
  private serviceHelper: ServiceHelper;
  private ownershipChainService: OwnershipChainService;

  constructor() {
    const config: LaosConfig = {
      minterPvks: process.env.MINTER_KEYS || '',
      rpcMinter: process.env.RPC_MINTER || '',
    };
    this.serviceHelper = new ServiceHelper(config);

    const ownershipChainConfig: OwnershipChainConfig = {
      pvks: process.env.MINTER_KEYS || '',
    };
    this.ownershipChainService = new OwnershipChainService(ownershipChainConfig);
  }

  /**
   * CreateCollections up to multiple NFTs in a batch.
   * @param {CreateCollectionInput} input - The createCollection input data.
   * @param {string} apiKey - The API key for authentication.
   * @returns {Promise<CreateCollectionResponse>} - The result of the createCollection operation.
   */
  public async createCollection(input: CreateCollectionInput, apiKey: string): Promise<CreateCollectionResponse> {
    const { chainId, name, symbol } = input;

    try {
      const client = await ClientService.getClientByKey(apiKey);
      if (!client) {
        throw new Error('Invalid API key');
      }

      // Check if creation is locked
      const currentDate = new Date();
      if (client.lock && new Date(client.lock).getTime() > currentDate.getTime()) {
        throw new Error(`Collection creation is locked until [${client.lock}]`);
      }else{
        // update with current date + 5minutes
        client.lock = new Date();
        client.lock.setMinutes(client.lock.getMinutes() + 5);        
        await ClientService.updateClientLock(client.id, client.lock);
      }

      const contract = await ContractService.getClientContractByChain(client.id, chainId);
      if(contract){
        console.log(`You already have a collection on this chain: ${chainId}, collection address: ${contract.contractAddress}`);
      }
      

      let evochainTarget = "LAOS";
      if (process.env.LAOS_CHAIN?.toLocaleLowerCase().includes("sigma")) {
        evochainTarget = "LAOS_SIGMA";
      }
      const {contractAddress, precompileAddress} = await this.serviceHelper.laosService.deployBatchMinterContract(apiKey);
      console.log("BatchMinter contract deployed at: ", contractAddress);

      const baseURI = this.serviceHelper.generateBaseUri(precompileAddress, evochainTarget);
      if (!baseURI) {
        throw new Error("BaseURI is null");
      }

      console.log("Deploying ownershipChain contract...");     
      const ownershipContractAddress = await this.ownershipChainService.deployNewErc721universal(chainId, name, symbol, baseURI, apiKey)
      console.log("OwnershipChain contract deployed at: ", ownershipContractAddress);
     

      // Save contract to DB
      await ContractService.insertContract(client.id, chainId, 
        ownershipContractAddress.toLowerCase(), 
        precompileAddress.toLowerCase(), 
        contractAddress.toLowerCase());
      console.log("Contract saved to DB");

      // release Client.lock
      await ClientService.updateClientLock(client.id, null);

      return {
        chainId: chainId,
        name: name,
        symbol: symbol,
        contractAddress: ownershipContractAddress.toLowerCase(),
        batchMinterAddress: contractAddress.toLowerCase(),
        laosAddress: precompileAddress.toLowerCase(),
        success: true,
      };
    } catch (error) {
      console.error('ERROR in createCollection: ', error);
      throw new Error(error as string);
    }
  }

}
