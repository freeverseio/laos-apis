import { ethers, TransactionReceipt, TransactionResponse } from "ethers";
import * as EvolutionCollection from "../../abi/EvolutionCollection";
import BatchMinterAbi from '../../abi/contracts/BatchMinter.json';
import { BatchMinterBytecode } from "../../abi/contracts/BatchMinterBytecode";
import EvolutionCollectionAbi from '../../abi/contracts/EvolutionCollection.json';
import EvolutionCollectionFactoryAbi from '../../abi/contracts/EvolutionCollectionFactory.json';
import { AssetMetadata, BatchMintNFTParams, BatchMintResult, DeploymentResult, EventName, EvolveBatchResult, EvolveNFTParams, LaosConfig, LaosTransaction, MintAsyncResponse, MintAsyncStatus, MintStatusResponse, TokenOwners, TransactionReceiptType, TransactionType } from "../../types";
import { IPFSService } from "../ipfs/IPFSService";
import { ContractService } from "./ContractService";
import { EvolveAsyncStatus, EvolveBatchResponse, EvolveStatusResponse } from "../../types/graphql/outputs/EvolveOutput";

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



  public async deployBatchMinterContract(apiKey: string): Promise<{ contractAddress: string, precompileAddress: string }> {
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

  private getEthersContract({ laosContractAddress, abi, wallet }: { laosContractAddress: string, abi: any, wallet: ethers.Wallet }) {
    return new ethers.Contract(laosContractAddress, abi, wallet);
  }

  private async batchMintNFTs(
    contract: any,
    tokens: { tokenUri: string, mintTo: string }[],
    wallet: ethers.Wallet,
    maxRetries: number
  ): Promise<BatchMintResult | undefined> {
    let tokenOwners: TokenOwners[] = [];
    let nonce = await wallet.getNonce();
    const randoms = Array.from({ length: tokens.length }, () => this.randomUint96());

    const { tokenUris, recipients } = tokens.reduce<{ tokenUris: string[], recipients: string[] }>((acc, token) => {
      acc.tokenUris.push(token.tokenUri);
      acc.recipients.push(token.mintTo);
      return acc;
    }, { tokenUris: [], recipients: [] });

    tokenOwners = tokens.map((token, index) => (
      {
        tokenId: this.getTokenIdFromSlotNumber(token.mintTo, randoms[index]),
        owner: token.mintTo,
        tokenUri: token.tokenUri
      }));

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
        return {
          status: 'success',
          tokenIds: tokenOwners.map(token => token.tokenId),
          tx: tx,
          contractAddress: contract.address
        };
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

  public async batchMintAsync(params: BatchMintNFTParams, apiKey: string): Promise<BatchMintResult> {
    const minterPvk = JSON.parse(process.env.MINTER_KEYS || '{}')[apiKey];
    const wallet = new ethers.Wallet(minterPvk, this.provider);
    const contract = this.getEthersContract({ laosContractAddress: params.laosBatchMinterContractAddress, abi: BatchMinterAbi, wallet });
    let tx: any;
    try {
      const result = await this.batchMintNFTs(contract, params.tokens, wallet, 5);
      if (!result || !result.tx) {
        throw new Error("Transaction not found");
      }
      tx = result.tx;
      return {
        status: MintAsyncStatus.PENDING,
        tx: tx?.hash,
        tokenIds: result.tokenIds ?? [],
        contractAddress: result.contractAddress
      };
    } catch (error: any) {
      console.error("Minting Failed:", error.message);
      return {
        status: MintAsyncStatus.REVERTED,
        tx: tx?.hash,
        error: error.message,
      };
    }
  }

  public async batchMint(params: BatchMintNFTParams, apiKey: string): Promise<BatchMintResult> {
    const minterPvk = JSON.parse(process.env.MINTER_KEYS || '{}')[apiKey];
    const wallet = new ethers.Wallet(minterPvk, this.provider);
    const contract = this.getEthersContract({ laosContractAddress: params.laosBatchMinterContractAddress, abi: BatchMinterAbi, wallet });
    let tx: any;
    try {
      const result = await this.batchMintNFTs(contract, params.tokens, wallet, 5);
      if (!result) {
        throw new Error("Transaction not found");
      }
      tx = result.tx;

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

    console.time('elapsed-IPFS');

    for (const token of params.tokens) {
      const assetJson: AssetMetadata = {
        name: `${token.assetMetadata.name}`,
        description: `${token.assetMetadata.description}`,
        image: `${token.assetMetadata.image}`,
        attributes: token.assetMetadata.attributes,
      };

      // Upload asset metadata to IPFS
      const ipfsCid = await this.ipfsService.getCid(assetJson);
      this.ipfsService.uploadAssetMetadataToIPFS(assetJson, token.assetMetadata.name, ipfsCid);
      const tokenUri = `ipfs://${ipfsCid}`;

      tokenIds.push(token.tokenId);
      tokenUris.push(tokenUri);
    }
    console.timeEnd('elapsed-IPFS');

    let tx: any;
    try {
      console.log('Evolving NFTs with tokenIds:', tokenIds);
      tx = await contract.evolveWithExternalURIBatch(tokenIds, tokenUris, { nonce: await wallet.getNonce() });

      console.log('Transaction sent, waiting for confirmation...');
      console.time('elapsed-receipt');

      const receipt = await this.retryOperation(
        () => this.provider.waitForTransaction(tx.hash, 1, 14000),
        20
      );
      console.timeEnd('elapsed-receipt');

      const evolvedTokenIds = this.extractTokenIds(receipt, 'EvolvedWithExternalURI');
      console.log('Evolve successful');
      return {
        status: 'success',
        tokens: evolvedTokenIds.map(id => ({ tokenId: id.toString(), tokenUri: tokenUris[evolvedTokenIds.indexOf(id)] })),
        tx: tx?.hash,
      };
    } catch (error: any) {
      console.error('Evolve Failed:', error.message);
      return {
        status: 'failed',
        tokens: [],
        tx: tx?.hash,
        error: error.message,
      };
    }
  }

  public async evolveBatchAsync(params: EvolveNFTParams, apiKey: string): Promise<EvolveBatchResult> {
    const minterPvk = JSON.parse(process.env.MINTER_KEYS || '{}')[apiKey];
    const wallet = new ethers.Wallet(minterPvk, this.provider);
    const contract = this.getEthersContract({ laosContractAddress: params.laosContractAddress, abi: BatchMinterAbi, wallet });

    const tokenIds: string[] = [];
    const tokenUris: string[] = [];

    console.time('elapsed-IPFS');

    for (const token of params.tokens) {
      const assetJson: AssetMetadata = {
        name: `${token.assetMetadata.name}`,
        description: `${token.assetMetadata.description}`,
        image: `${token.assetMetadata.image}`,
        attributes: token.assetMetadata.attributes,
      };

      // Upload asset metadata to IPFS
      const ipfsCid = await this.ipfsService.getCid(assetJson);
      this.ipfsService.uploadAssetMetadataToIPFS(assetJson, token.assetMetadata.name, ipfsCid);
      const tokenUri = `ipfs://${ipfsCid}`;

      tokenIds.push(token.tokenId);
      tokenUris.push(tokenUri);
    }
    console.timeEnd('elapsed-IPFS');

    let tx: any;
    try {
      console.log('Evolving NFTs with tokenIds:', tokenIds);
      tx = await contract.evolveWithExternalURIBatch(tokenIds, tokenUris, { nonce: await wallet.getNonce() });
      if (!tx) {
        throw new Error("Transaction not found");
      }
      return {
        status: EvolveAsyncStatus.PENDING,
        tokens: tokenIds.map(id => ({ tokenId: id.toString(), tokenUri: tokenUris[tokenIds.indexOf(id)] })),
        tx: tx?.hash,
      };
    } catch (error: any) {
      console.error('Evolve Failed:', error.message);
      return {
        status: EvolveAsyncStatus.REVERTED,
        tokens: [],
        tx: tx?.hash,
        error: error.message,
      };
    }
  }

  public checkTransactionType(tx: TransactionResponse, eventName: string): boolean {
    
    const iface = new ethers.Interface(BatchMinterAbi);
    try {
      const decodedData = iface.parseTransaction({ data: tx.data, value: tx.value });
      return decodedData?.name === eventName; // Replace with the expected method name
    } catch (error) {
      console.error("Error decoding transaction data:", error);
      return false;
    }
  }

  private extractTokenIds(receipt: ethers.TransactionReceipt, eventName: EventName): bigint[] {
    if (!receipt) {
      throw new Error("Transaction receipt is missing");
    }

    if (receipt.status !== 1) {
      console.error("Receipt: ", receipt);
      throw new Error(`Transaction failed with status: ${receipt.status}`);
    }

    const eventType = eventNameToEventTypeMap[eventName];
    if (!eventType || !eventType.decode) {
      throw new Error(`Event type or decoder not found for event: ${eventName}`);
    }

    const tokenIds: bigint[] = [];

    receipt.logs.forEach((log, index) => {
      try {
        const decodedLog = eventType.decode(log as any);
        if (decodedLog && decodedLog._tokenId !== undefined && decodedLog._tokenId !== null) {
          tokenIds.push(decodedLog._tokenId);
        } else {
          throw new Error(`Decoded log does not contain a valid _tokenId. Log index: ${index}`);
        }
      } catch (error: any) {
        throw new Error(`Failed to decode event ${eventName} from log at index ${index}: ${error.message || error}`);
      }
    });

    if (tokenIds.length === 0) {
      throw new Error(`No valid token IDs extracted for event: ${eventName}`);
    }

    return tokenIds;
  }


  public async mintResponse(txHash: string): Promise<MintStatusResponse> {
    let result: LaosTransaction;
  
    try {
      result = await this.getTransaction(txHash);
      console.log("Result:", result.type);
    } catch (error) {
      console.error("Error fetching transaction or receipt:", error);
      return {
        status: MintAsyncStatus.INCORRECT_TX_HASH,
        txHash: txHash,
        message: "The transaction hash is incorrect",
      };
    }
  
    if (result.type === TransactionType.NOT_FOUND) {
      return {
        status: MintAsyncStatus.NOT_FOUND,
        txHash: txHash,
        message: "This transaction is not known to the blockchain nodes",
      };
    }
  
    if (result.type === TransactionType.RECEIPT) {
      // If it's a receipt, check the status
      const receipt = result.receipt!;
      if (receipt.status === 1) {
        try {
          const tokenIds = this.extractTokenIds(receipt, 'MintedWithExternalURI');
          return {
            status: MintAsyncStatus.SUCCESS,
            txHash: txHash.toString(),
            message: "Transaction successful",
            receipt: this.mapTransactionReceipt(receipt),
            tokenIds: tokenIds.map(id => id.toString()),
          };
        } catch (error) {
          return {
            status: MintAsyncStatus.INCORRECT_EVENT,
            txHash: txHash,
            message: "This txHash does not correspond to a mint transaction",
            receipt: this.mapTransactionReceipt(receipt),
          };
        }
      } else if (receipt.status === 0) {
        return {
          status: MintAsyncStatus.REVERTED,
          txHash: txHash,
          message: "Transaction has been reverted",
          receipt: this.mapTransactionReceipt(receipt),
        };
      }
  
      return {
        status: MintAsyncStatus.REVERTED,
        txHash: txHash,
        message: "Transaction status is unknown",
        receipt: this.mapTransactionReceipt(receipt),
      };
    } else {
      // If it's a transaction, it's still in the mempool
      if (this.checkTransactionType(result.tx!, 'mintWithExternalURIBatch')) {
        return {
          status: MintAsyncStatus.PENDING,
          txHash: txHash,
          message: "Transaction is submitted to the blockchain but not included in a block yet",
        };
      } else {
        return {
          status: MintAsyncStatus.INCORRECT_EVENT,
          txHash: txHash,
          message: "This txHash does not correspond to a mint transaction",
        };
      }
    }
  }
  

  public async evolveBatchResponse(txHash: string): Promise<EvolveStatusResponse> {
    let result: LaosTransaction;

    try {
      result = await this.getTransaction(txHash);
    } catch (error) {
      console.error("Error fetching transaction or receipt:", error);
      return {
        status: EvolveAsyncStatus.INCORRECT_TX_HASH,
        txHash: txHash,
        message: "Transaction not found",
      };
    }
    if (result.type === TransactionType.NOT_FOUND) {
      return {
        status: EvolveAsyncStatus.NOT_FOUND,
        txHash: txHash,
        message: "This transaction is not known to the blockchain nodes",
      };
    }
    if (result.type === TransactionType.RECEIPT) {
      // If it's a receipt, check the status
      const receipt = result.receipt as TransactionReceipt;
      if (receipt.status === 1) {
        try {
          const evolvedTokenIds = this.extractTokenIds(receipt, 'EvolvedWithExternalURI');
          return {
            status: EvolveAsyncStatus.SUCCESS,
            txHash: txHash.toString(),
            message: "Transaction successful",
            receipt: this.mapTransactionReceipt(receipt),
            tokenIds: evolvedTokenIds.map(id => id.toString()),
          };
        } catch (error) {
          return {
            status: EvolveAsyncStatus.TRANSACTION_TYPE_MISTATCH,
            txHash: txHash,
            message: "This txHash does not correspond to a mint transaction",
            receipt: this.mapTransactionReceipt(receipt),
          };
        }
      } else if (receipt.status === 0) {
        return {
          status: EvolveAsyncStatus.REVERTED,
          txHash: txHash,
          message: "Transaction has been reverted",
          receipt: this.mapTransactionReceipt(receipt),
        };
      }

      return {
        status: EvolveAsyncStatus.REVERTED,
        txHash: txHash,
        message: "Transaction status is unknown",
        receipt: this.mapTransactionReceipt(receipt),
      };
    } else {
      // If it's a transaction, it's still in the mempool
      if (this.checkTransactionType(result.tx!, 'evolveWithExternalURIBatch')) {
        return {
          status: EvolveAsyncStatus.PENDING,
          txHash: txHash,
          message: "Transaction is submitted to the blockchain but not included in a block yet",
        };
      } else {
        return {
          status: EvolveAsyncStatus.TRANSACTION_TYPE_MISTATCH,
          txHash: txHash,
          message: "This txHash does not correspond to a evolve transaction",
        };
      }
    }
  }


  private async getTransaction(txHash: string): Promise<LaosTransaction> {
    try {
      // Try to fetch the transaction receipt
      const receipt: TransactionReceipt | null = await this.provider.getTransactionReceipt(txHash);
      if (receipt) {
        return {
          tx: null,
          receipt: receipt,
          type: TransactionType.RECEIPT
        }; // Return the receipt if it exists
      }

      // If no receipt, try to fetch the transaction itself
      const transaction: TransactionResponse | null = await this.provider.getTransaction(txHash);
      if (transaction) {
        console.log("Transaction:", transaction);
        return {
          tx: transaction,
          receipt: null,
          type: TransactionType.TRANSACTION
        }; // Return the transaction if it's found
      }

      // If both are null, the transaction doesn't exist or is pruned
      return {
        tx: null,
        receipt: null,
        type: TransactionType.NOT_FOUND
      };
    } catch (error) {
      console.error("Error fetching transaction or receipt:", error);
      throw error; // Re-throw error if necessary for upstream handling
    }
  }

  private mapTransactionReceipt(receipt: TransactionReceipt): TransactionReceiptType {
    return {
      txHash: receipt.hash ?? null,
      blockHash: receipt.blockHash ?? null,
      blockNumber: receipt.blockNumber ?? null,
      gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
      cumulativeGasUsed: receipt.cumulativeGasUsed ? Number(receipt.cumulativeGasUsed) : null,
      status: receipt.status ?? null, // Explicitly set null if undefined
    };
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

  public randomUint96(): bigint {
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

  public getTokenIdFromSlotNumber(initOwner: string, slotNumber: bigint): string {
    if (!/^0x[a-fA-F0-9]{40}$/.test(initOwner)) {
      throw new Error("Invalid Ethereum address");
    }
    if (slotNumber < 0 || slotNumber >= 2 ** 96) {
      throw new Error("Slot must be a 96-bit unsigned integer");
    }
    // Convert slotOwner to BigNumber
    const slotOwnerBN = BigInt(initOwner);

    // Shift the slot number 160 bits to the left
    const slotNumberBN = slotNumber << 160n;

    // Combine the slot number and slot owner using bitwise OR
    const tokenId = slotNumberBN | slotOwnerBN;

    // Return the tokenId as a string
    return tokenId.toString(10);
  }

  public async setPrecompileAddress(batchMinterAddress: string, precompileAddress: string, apiKey: string): Promise<void> {
    console.log('Setting precompile address:', precompileAddress, 'to batchMinter:', batchMinterAddress);
    try {
      // Create an instance of the contract
      const minterPvk = JSON.parse(process.env.MINTER_KEYS || '{}')[apiKey];
      const wallet = new ethers.Wallet(minterPvk, this.provider);
      const contract = this.getEthersContract({ laosContractAddress: batchMinterAddress, abi: BatchMinterAbi, wallet });
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

  public async createLaosCollection(apiKey: string): Promise<string> {
    try {
      // Create an instance of the contract
      const minterPvk = JSON.parse(process.env.MINTER_KEYS || '{}')[apiKey];
      const wallet = new ethers.Wallet(minterPvk, this.provider);

      const contract = this.getEthersContract({ laosContractAddress: '0x0000000000000000000000000000000000000403', abi: EvolutionCollectionFactoryAbi, wallet });

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
      receipt.logs.forEach((log: any) => {
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

