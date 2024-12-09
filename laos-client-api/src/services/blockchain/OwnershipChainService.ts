import { ethers } from "ethers";
import { BroadcastResult, OwnershipChainConfig, BroadcastParams, BroadcastBatchParams, BroadcastBatchResult } from "../../types";
import ERC721UniversalAbi from '../../abi/contracts/ERC721Universal.json';
import { ERC721UniversalBytecode } from '../../abi/contracts/ERC721UniversalBytecode';
import { ContractService } from "./ContractService";
import { DeploymentResult } from "../../types";
import { BroadcastType } from "../../types/graphql/inputs/BroadcastInput";
export class OwnershipChainService {
  private pvks: string = '';

  constructor(config: OwnershipChainConfig) {
    const { pvks } = config;
    if (!pvks) {
      throw new Error('Private keys not found in environment variables');
    }
    this.pvks = pvks;
  }

  public async broadcast(params: BroadcastParams, apiKey: string, type: BroadcastType = BroadcastType.SELF): Promise<BroadcastResult> {
    const pvk = JSON.parse(this.pvks || '{}')[apiKey];
    if (!pvk) {
      throw new Error('Private key not found for API key');
    }
    const rpcOwnershipChain = this.getChainRpcbyChainId(params.chainId);
    const ownershipChainContract = params.ownershipContractAddress;
    const provider = new ethers.JsonRpcProvider(rpcOwnershipChain);
    const wallet = new ethers.Wallet(pvk, provider);
    const contract = new ethers.Contract(ownershipChainContract, ERC721UniversalAbi, wallet);
    const nonce = await wallet.getNonce();
    let tx: any;
    try {
      console.log("Broadcasting tokenId:", params.tokenId);
      if (type === BroadcastType.MINT) {
        tx = await contract.broadcastMint(params.tokenId, { nonce })
          .catch((error: Error) => {
            return this.broadcastError(error, tx);
          });
      } else {
        tx = await contract.broadcastSelfTransfer(params.tokenId, { nonce })
          .catch((error: Error) => {
            return this.broadcastError(error, tx);
          });
      }
      const receipt = await this.retryOperation(
        () => provider.waitForTransaction(tx.hash, 1, 14000),
        20
      );

      return {
        status: "success",
        tokenId: params.tokenId,
        tx: tx?.hash,
      };
    } catch (error: any) {
      console.error("BroadcastSelfTransfer Failed:", error.message);
      return {
        status: "failed",
        tx: tx?.hash,
        error: error.message,
      };
    }
  }

  public async broadcastBatch(params: BroadcastBatchParams, apiKey: string, type: BroadcastType = BroadcastType.SELF): Promise<BroadcastBatchResult> {
    const pvk = JSON.parse(this.pvks || '{}')[apiKey];
    if (!pvk) {
      throw new Error('Private key not found for API key');
    }
    const rpcOwnershipChain = this.getChainRpcbyChainId(params.chainId);
    const ownershipChainContract = params.ownershipContractAddress;
    const provider = new ethers.JsonRpcProvider(rpcOwnershipChain);
    const wallet = new ethers.Wallet(pvk, provider);
    const contract = new ethers.Contract(ownershipChainContract, ERC721UniversalAbi, wallet);
    const nonce = await wallet.getNonce();
    let tx: any;
    try {
      console.log("Broadcasting tokenId:", params.tokenIds);
      if (type === BroadcastType.MINT) {
        tx = await contract.broadcastMintBatch(params.tokenIds, { nonce })
          .catch((error: Error) => {
            return this.broadcastError(error, tx);
          });
      } else {
        tx = await contract.broadcastSelfTransferBatch(params.tokenIds, { nonce })
          .catch((error: Error) => {
            return this.broadcastError(error, tx);
          });
      }
      const receipt = await this.retryOperation(
        () => provider.waitForTransaction(tx.hash, 1, 14000),
        20
      );

      return {
        status: "success",
        tokenIds: params.tokenIds,
        tx: tx?.hash,
      };
    } catch (error: any) {
      console.error("BroadcastSelfTransfer Failed:", error.message);
      return {
        status: "failed",
        tx: tx?.hash,
        error: error.message,
      };
    }
  }

  private broadcastError(error: any, tx: any) {
    console.error("BroadcastSelfTransfer Failed:", error.message);
    return {
      status: "failed",
      tx: tx?.hash,
      error: error.message,
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

  private getChainRpcbyChainId(chainId: string): string {
    const chains = [
      { chainId: "1", rpcUrl: process.env.API_RPC_ETHEREUM || "https://ethereum-rpc.publicnode.com" },
      { chainId: "137", rpcUrl: process.env.API_RPC_POLYGON || "https://polygon-rpc.com/" },
      { chainId: "295", rpcUrl: process.env.API_RPC_HEDERA_MAINNET || "https://mainnet.hashio.io/api" },
      { chainId: "296", rpcUrl: process.env.API_RPC_HEDERA_TESTNET || "https://testnet.hashio.io/api" },
    ];

    const chain = chains.find(c => c.chainId === chainId);
    if (chain) {
      return chain.rpcUrl;
    } else {
      console.error('Chain ID not supported:', chainId);
      throw new Error("Chain ID not supported");
    }
  }

  public async deployNewErc721universal(chainId: string, name: string, symbol: string, baseURI: string, apiKey: string): Promise<any> {
    const pvk = JSON.parse(this.pvks || '{}')[apiKey];
    if (!pvk) {
      throw new Error('Private key not found for API key');
    }
    const rpcOwnershipChain = this.getChainRpcbyChainId(chainId);
    const provider = new ethers.JsonRpcProvider(rpcOwnershipChain);
    const wallet = new ethers.Wallet(pvk, provider);
    const deployer = new ContractService(pvk, rpcOwnershipChain);
    try {
      const deploymentResult: DeploymentResult = await deployer.deployContract(
        ERC721UniversalAbi,
        ERC721UniversalBytecode,
        [wallet.address, name, symbol, baseURI]
      );

      return deploymentResult.contractAddress;
    } catch (error) {
      console.error("Error deploying ERC721Universal contract:", error);
      throw error;
    }
  }



}