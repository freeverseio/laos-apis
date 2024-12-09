import { ethers } from "ethers";
import { MintSingleNFTParams, EvolveNFTParams, MintResult, EvolveResult, AssetMetadata, LaosConfig, EventName, BatchMintNFTParams, BatchMintResult, DeploymentResult, EvolveBatchResult } from "../../types";
import { IPFSService } from "../ipfs/IPFSService";
import * as EvolutionCollection from "../../abi/EvolutionCollection";
import EvolutionCollectionAbi from '../../abi/contracts/EvolutionCollection.json';
import BatchMinterAbi from '../../abi/contracts/BatchMinter.json';
import EvolutionCollectionFactoryAbi from '../../abi/contracts/EvolutionCollectionFactory.json';
import { ContractService } from "./ContractService";
import { BatchMinterBytecode } from "../../abi/contracts/BatchMinterBytecode";

const eventNameToEventTypeMap = {
  MintedWithExternalURI: EvolutionCollection.events.MintedWithExternalURI,
  EvolvedWithExternalURI: EvolutionCollection.events.EvolvedWithExternalURI,
};

export class LaosService {
  private provider: ethers.JsonRpcProvider;
  private ipfsService: IPFSService;
  private laosRpc: string;



  constructor(config: LaosConfig, ipfsService: IPFSService) {
    const { rpcMinter } = config;
    this.provider = new ethers.JsonRpcProvider(rpcMinter);
    this.ipfsService = ipfsService;
    this.laosRpc = rpcMinter;
  }

  private async mintNFTWithRetries(
    contract: any,
    params: { to: string },
    ipfsCid: string,
    wallet: ethers.Wallet,
    maxRetries: number
  ): Promise<any> {
    let nonce = await wallet.getNonce();
    const random = this.randomUint96();
    const tokenUri = `ipfs://${ipfsCid}`;
  
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log("Minting NFT to:", params.to, "nonce:", nonce);
        const tx = await contract.mintWithExternalURI(params.to, random, tokenUri, {
          nonce: nonce
        });
  
        console.log(`Mint successful on attempt ${attempt}`);
        return tx;
      } catch (error) {
        const errorMessage = (error as Error).message;
        if (errorMessage.includes("nonce too low") || errorMessage.includes("NONCE_EXPIRED")) {
          console.log(`Nonce error detected [${nonce}], retrieveing new nonce`);
          nonce = await wallet.getNonce();

        } else if (errorMessage.includes("replacement transaction underpriced") || errorMessage.includes("REPLACEMENT_UNDERPRICED") || errorMessage.includes("intrinsic gas too low")) {
          console.log(`Underpriced error detected`);
          throw error;

        } else {
          console.error(
            `Mint Failed, attempt: ${attempt}, nonce:`,
            nonce,
            "error: ",
            errorMessage
          );
          throw error;
        }
  
        if (attempt === maxRetries) {
          console.error("Max retries reached, throwing last error");
          throw error;
        }
      }
    }
  }

  public async mint(params: MintSingleNFTParams, apiKey: string): Promise<MintResult> {
    const minterPvk = JSON.parse(process.env.MINTER_KEYS || '{}')[apiKey];
    const wallet = new ethers.Wallet(minterPvk, this.provider);
    const contract = this.getEthersContract({laosContractAddress: params.laosContractAddress, abi: EvolutionCollectionAbi, wallet});
    const assetJson: AssetMetadata = {
      name: `${params.assetMetadata.name} `,
      description: `${params.assetMetadata.description}`,
      image: `${params.assetMetadata.image}`,
      attributes: params.assetMetadata.attributes,
    };
    const ipfsCid = await this.ipfsService.uploadAssetMetadataToIPFS(assetJson, params.assetMetadata.name);
    let tx: any;
    try {
      tx = await this.mintNFTWithRetries(contract, params, ipfsCid, wallet, 5);
      
      const receipt = await this.retryOperation(
        () => this.provider.waitForTransaction(tx.hash, 1, 14000),
        20
      );
      
      const tokenId = this.extractTokenId(receipt, contract, 'MintedWithExternalURI');
      return {
        status: "success",
        tokenId: tokenId.toString(),
        tx: tx?.hash,
      };
    } catch (error: any) {
      console.error("Minting Failed:", error.message);
      return {
        status: "failed",
        tx: tx?.hash,
        error: error.message,
      };
    }
  }

  public async deployBatchMinterContract(apiKey: string): Promise<{contractAddress: string, precompileAddress: string}> {
    const minterPvk = JSON.parse(process.env.MINTER_KEYS || '{}')[apiKey];
    const deployer = new ContractService(minterPvk, this.laosRpc);
    const provider = new ethers.JsonRpcProvider(this.laosRpc);
    const wallet = new ethers.Wallet(minterPvk, provider);
    try {
      const deploymentResult: DeploymentResult = await deployer.deployContract(
        BatchMinterAbi,
        BatchMinterBytecode,
        [wallet.address]        
      );
      let precompileAddress = '';
      if (!deploymentResult.logs || deploymentResult.logs.length === 0) {
        throw new Error("No logs found in deployment result");
      } else {
        const event = deploymentResult.logs.find((parsedLog: any) => parsedLog && parsedLog.name === "NewBatchMinter");
        if (!event) {
          throw new Error("NewBatchMinter event not found in logs");
        }
        const { _precompileAddress } = event.args;
        precompileAddress = _precompileAddress;
      }
      


      return {
        contractAddress: deploymentResult.contractAddress,
        precompileAddress: precompileAddress
      };
    } catch (error) {
      console.error("Error deploying ERC721Universal contract:", error);
      throw error;
    }
  }

  private getEthersContract({laosContractAddress, abi, wallet}: {laosContractAddress: string, abi: any, wallet: ethers.Wallet}) {
    return new ethers.Contract(laosContractAddress, abi, wallet);
  }

  private async batchMintNFTWithRetries(
    contract: any,
    tokens: {tokenUri: string, mintTo: string}[],    
    wallet: ethers.Wallet,
    maxRetries: number
  ): Promise<any> {
    let nonce = await wallet.getNonce();
    const randoms = Array.from({ length: tokens.length }, () => this.randomUint96());

    const { tokenUris, recipients } = tokens.reduce<{ tokenUris: string[], recipients: string[] }>((acc, token) => {
      acc.tokenUris.push(token.tokenUri);
      acc.recipients.push(token.mintTo);
      return acc;
    }, { tokenUris: [], recipients: [] });

    if (tokenUris.length > 700) {
      throw new Error("Cannot mint more than 700 assets at a time");
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log("Minting NFT to:", recipients, "nonce:", nonce);
        // recipients, randoms, uris, options
        const tx = await contract.mintWithExternalURIBatch(recipients, randoms, tokenUris, {
          nonce: nonce,
        });
  
        console.log(`Mint successful on attempt ${attempt}`);
        return tx;
      } catch (error) {
        const errorMessage = (error as Error).message;
        if (errorMessage.includes("nonce too low") || errorMessage.includes("NONCE_EXPIRED")) {
          console.log(`Nonce error detected [${nonce}], retrieveing new nonce`);
          nonce = await wallet.getNonce();
        } else if (errorMessage.includes("replacement transaction underpriced") || errorMessage.includes("REPLACEMENT_UNDERPRICED") || errorMessage.includes("intrinsic gas too low")) {
          console.log(`Underpriced error detected`);
          throw error;
        } else {
          console.error(
            `Mint Failed, attempt: ${attempt}, nonce:`,
            nonce,
            "error: ",
            errorMessage
          );
          throw error;
        }
  
        if (attempt === maxRetries) {
          console.error("Max retries reached, throwing last error");
          throw error;
        }
      }
    }
  }

  public async batchMint(params: BatchMintNFTParams, apiKey: string): Promise<BatchMintResult> {
    const minterPvk = JSON.parse(process.env.MINTER_KEYS || '{}')[apiKey];
    const wallet = new ethers.Wallet(minterPvk, this.provider);
    const contract = this.getEthersContract({laosContractAddress: params.laosBatchMinterContractAddress, abi: BatchMinterAbi, wallet});
    let tx: any;
    try {
      tx = await this.batchMintNFTWithRetries(contract, params.tokens, wallet, 5);
      
      const receipt = await this.retryOperation(
        () => this.provider.waitForTransaction(tx.hash, 1, 14000),
        20
      );
      
      const tokenIds = this.extractTokenIds(receipt, 'MintedWithExternalURI');
      return {
        status: "success",
        numberOfTokens: tokenIds.length,
        tokenIds: tokenIds.map(bigintValue => bigintValue.toString()),
        tx: tx?.hash,
      };
    } catch (error: any) {
      console.error("Minting Failed:", error.message);
      return {
        status: "failed",
        numberOfTokens: 0,
        tokenIds: [],
        tx: tx?.hash,
        error: error.message,
      };
    }
  }

  public async evolveBatch(params: EvolveNFTParams, apiKey: string): Promise<EvolveBatchResult> {
    const minterPvk = JSON.parse(process.env.MINTER_KEYS || '{}')[apiKey];
    const wallet = new ethers.Wallet(minterPvk, this.provider);
    const contract = this.getEthersContract({ laosContractAddress: params.laosContractAddress, abi: BatchMinterAbi, wallet });
  
    const tokenIds: string[] = [];
    const tokenUris: string[] = [];
  
    for (const token of params.tokens) {
      const assetJson: AssetMetadata = {
        name: `${token.assetMetadata.name}`,
        description: `${token.assetMetadata.description}`,
        image: `${token.assetMetadata.image}`,
        attributes: token.assetMetadata.attributes,
      };
      
      // Upload asset metadata to IPFS
      const ipfsCid = await this.ipfsService.uploadAssetMetadataToIPFS(assetJson, token.assetMetadata.name);
      const tokenUri = `ipfs://${ipfsCid}`;
      
      tokenIds.push(token.tokenId);
      tokenUris.push(tokenUri);
    }
  
    let tx: any;
    try {
      console.log('Evolving NFTs with tokenIds:', tokenIds);
      tx = await contract.evolveWithExternalURIBatch(tokenIds, tokenUris, { nonce: await wallet.getNonce() });
      
      console.log('Transaction sent, waiting for confirmation...');
      const receipt = await this.retryOperation(
        () => this.provider.waitForTransaction(tx.hash, 1, 14000),
        20
      );
  
      const evolvedTokenIds = this.extractTokenIds(receipt, 'EvolvedWithExternalURI');
      return {
        status: 'success',
        tokens: evolvedTokenIds.map(id => ({ tokenId: id.toString(), tokenUri: tokenUris[evolvedTokenIds.indexOf(id)] })),
        tx: tx?.hash,
      };
    } catch (error: any) {
      console.error('Evolving Failed:', error.message);
      return {
        status: 'failed',
        tokens: [],
        tx: tx?.hash,
        error: error.message,
      };
    }
  }
  
  private extractTokenId(receipt: ethers.TransactionReceipt, contract: ethers.Contract, eventName: EventName): bigint {
    if (!receipt || !receipt.status || receipt.status !== 1) {
        throw new Error("Receipt status is not 1");
    }
    const log = receipt.logs[0] as any;
    const logDecoded = eventNameToEventTypeMap[eventName].decode(log);
    const { _tokenId } = logDecoded;
    return _tokenId;
  }

  private extractTokenIds(receipt: ethers.TransactionReceipt, eventName: EventName): bigint[] {
    if (!receipt || !receipt.status || receipt.status !== 1) {
      console.error("Receipt: ", receipt);
      throw new Error("Receipt status is not 1");
    }
  
    return receipt.logs
      .map(log => {
        try {
          const logDecoded = eventNameToEventTypeMap[eventName].decode(log as any);
          return logDecoded._tokenId;
        } catch (error) {
          // If decoding fails, it's likely not the event we're looking for
          return null;
        }
      })
      .filter((tokenId): tokenId is bigint => tokenId !== null);
  }

  private async retryOperation(operation: () => Promise<any>, maxRetries: number): Promise<any> {
    try {
      return await operation();
    } catch (error: any) {
      if (maxRetries <= 1) {
        console.error("Transaction Confirmation Failed:", error.message);
        throw error;
      } else {
        return this.retryOperation(operation, maxRetries - 1);
      }
    }
  }

  private randomUint96(): bigint {
    const getRandomValuesCompat = (arr: Uint32Array): Uint32Array => {
      if (typeof window === 'undefined') {
        return require('crypto').webcrypto.getRandomValues(arr);
      } else {
        return window.crypto.getRandomValues(arr);
      }
    };

    const arr1 = new Uint32Array(1);
    const arr2 = new Uint32Array(1);
    const arr3 = new Uint32Array(1);
    getRandomValuesCompat(arr1);
    getRandomValuesCompat(arr2);
    getRandomValuesCompat(arr3);

    const result = BigInt(arr1[0]) * 2n ** 64n + BigInt(arr2[0]) * 2n ** 32n + BigInt(arr3[0]);

    return this.isValidUint96(result) ? result : this.randomUint96();
  }

  private isValidUint96(value: bigint): boolean {
    return value < 2n ** 96n;
  }

  public async setPrecompileAddress(batchMinterAddress: string, precompileAddress: string, apiKey: string): Promise<void> {
    console.log('Setting precompile address:', precompileAddress, 'to batchMinter:', batchMinterAddress);
    try {
      // Create an instance of the contract
      const minterPvk = JSON.parse(process.env.MINTER_KEYS || '{}')[apiKey];
      const wallet = new ethers.Wallet(minterPvk, this.provider);
      const contract = this.getEthersContract({laosContractAddress: batchMinterAddress, abi: BatchMinterAbi, wallet});                
      const tx = await contract.setPrecompileAddress(precompileAddress);
      console.log('Transaction sent, waiting for confirmation...');
      const receipt = await tx.wait();
      console.log("Transaction successful! Hash:", receipt.hash);
      return receipt.hash;
    } catch (error) {
      console.error('Error setting precompile address:', error);
      throw error;
    }
  }
  public async transferOwnership(contractAddress: string, newOwner: string, apiKey: string): Promise<void> {
    const minterPvk = JSON.parse(process.env.MINTER_KEYS || '{}')[apiKey];
    const deployer = new ContractService(minterPvk, this.laosRpc);
    try {
      await deployer.transferOwnership(contractAddress, EvolutionCollectionAbi, newOwner);
    } catch (error) {
      console.error("Error transferring ownership:", error);
      throw error;
    }
  }

  public async createLaosCollection( apiKey: string): Promise<string> {
    try {
      // Create an instance of the contract
      const minterPvk = JSON.parse(process.env.MINTER_KEYS || '{}')[apiKey];
      const wallet = new ethers.Wallet(minterPvk, this.provider);
      
      const contract = this.getEthersContract({laosContractAddress: '0x0000000000000000000000000000000000000403', abi: EvolutionCollectionFactoryAbi, wallet});

      console.log('Creating a collection with owner = ', wallet.address);

      // Send the transaction to create the collection
      const tx = await contract.createCollection(wallet.address);
      console.log('Transaction sent, waiting for confirmation...');
      console.log('Transaction hash:', tx.hash);

      // Wait for the transaction to be mined
      const receipt = await tx.wait();
      console.log("Transaction successful! Hash:", receipt.hash);

      if (!receipt || !receipt.status || receipt.status !== 1) {
        throw new Error("Receipt status is not 1");
      }

      // Define the event interface for decoding logs
      const eventInterface = new ethers.Interface(EvolutionCollectionFactoryAbi);
      let laosCollectionAddress = '';
      receipt.logs.forEach((log:any) => {
        try {
            const parsedLog = eventInterface.parseLog(log);
            if (parsedLog?.name === "NewCollection") {
              console.log(`New collection created by ${parsedLog.args._owner} at address ${parsedLog.args._collectionAddress}`);
              laosCollectionAddress = parsedLog.args._collectionAddress;
            }
        } catch (error) {
            console.log(error);
        }
      });      
      
      if (!laosCollectionAddress) {
        throw new Error('No NewCollection event found in transaction receipt');
      }
      console.log(`New collection created at address ${laosCollectionAddress}`);
          
      return laosCollectionAddress;      
    } catch (error) {
      console.error('Error creating collection:', error);
      throw error;
    }    
  }

}

