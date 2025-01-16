import {  TransactionReceipt, TransactionResponse } from "ethers";
import { LaosService } from "./LaosService"; 
import { IPFSService } from "../ipfs/IPFSService"; 
import { MintSingleNFTParams, EvolveNFTParams, EvolveBatchResult, BatchMintNFTParams } from "../../types";
import { MintAsyncStatus, TransactionReceiptType } from "../../types/graphql/outputs/MintOutput";
import * as EvolutionCollection from "../../abi/EvolutionCollection";
import { AttributeInput,  } from "../../types/graphql/inputs/MintInput";


jest.mock("../../types/graphql/outputs/MintOutput", () => ({
  TransactionReceiptType: jest.fn(),
  MintAsyncStatus: {
    PENDING: "PENDING",
    SUCCESS: "SUCCESS",
    REVERTED: "REVERTED",
    NOT_FOUND: "NOT_FOUND",
    INCORRECT_EVENT: "INCORRECT_EVENT",
    INCORRECT_TX_HASH: "INCORRECT_TX_HASH",
  }
}));
jest.mock("../../types/graphql/inputs/MintInput", () => ({
  AttributeInput: jest.fn(),
}));

jest.mock("../../types/graphql/outputs/EvolveOutput", () => ({
  EvolveResponse: jest.fn(),
}));


jest.mock("../ipfs/IPFSService");
jest.mock("../../abi/EvolutionCollection", () => ({
  events: {
    MintedWithExternalURI: {
      decode: jest.fn(),
    },
    EvolvedWithExternalURI: {
      decode: jest.fn(),
    },
  },
}));

const mockEventNameToEventTypeMap = {
  MintedWithExternalURI: {
    decode: jest.fn(),
  },
  EvolvedWithExternalURI: {
    decode: jest.fn(),
  },
};


describe("checkTransactionType", () => {
  let laosService: LaosService;
  let mockIPFSService: jest.Mocked<IPFSService>;

  beforeEach(() => {
    mockIPFSService = new IPFSService("mockApiKey", "mockApiSecret") as jest.Mocked<IPFSService>;
    const config = {
      minterPvks: "mockPrivateKey",
      rpcMinter: "mockRpcMinter",
    };
    laosService = new LaosService(config, mockIPFSService);
  });

  it("should return true if the transaction type is correct for mintWithExternalURIBatch", () => {
    const mockTransaction: Partial<TransactionResponse> = {
      value: 0n,
      data: "0x48c0550e000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000883fe5b3766155f075a8e1f207a9689294fe528f00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000cbd51c88e16caedb310f3d74000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000035697066733a2f2f516d5179704e6979676f533756365562644a424868614566486b3357485a7872547a6d7a6e765658435554504d320000000000000000000000",
    };
    const result = laosService.checkTransactionType(mockTransaction as TransactionResponse, 'mintWithExternalURIBatch');
    expect(result).toBe(true);
  });

  it("should return true if the transaction type is correct for evolveWithExternalURIBatch", () => {
    const mockTransaction: Partial<TransactionResponse> = {
      value: 0n,
      data: "0x9eb8a6e300000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000185c2e35ae6775ec0c100a688883fe5b3766155f075a8e1f207a9689294fe528f000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000035697066733a2f2f516d564e41764b66676d4c7859733165514e6b5245705145523836537a31543264544c31684b75585a4a684155520000000000000000000000",
    };
    const result = laosService.checkTransactionType(mockTransaction as TransactionResponse, 'evolveWithExternalURIBatch');
    expect(result).toBe(true);
  });

});
