
import { ObjectType, Field, Int, Float } from "type-graphql";

@ObjectType()
export class TransactionReceiptType {
  @Field(() => String, { nullable: true })
  txHash?: string;

  @Field(() => String, { nullable: true })
  blockHash?: string | null;

  @Field(() => Int, { nullable: true })
  blockNumber?: number | null;

  @Field(() => Float, { nullable: true })
  gasUsed?: number | null;

  @Field(() => Float, { nullable: true })
  cumulativeGasUsed?: number | null;


  @Field(() => Int, { nullable: true })
  status?: number | null; // 1 for success, 0 for failure
}

@ObjectType()
export class MintResponse {
  @Field(() => Int, { nullable: false })
  numberOfTokens!: number;

  @Field(() => [String], { nullable: false })
  tokenIds!: string[];

  @Field()
  success!: boolean;
}

export enum MintAsyncStatus {
  PENDING = "PENDING",
  SUCCESS = "SUCCESS",
  REVERTED = "REVERTED",
  NOT_FOUND = "NOT_FOUND",
  INCORRECT_EVENT = "INCORRECT_EVENT",
  INCORRECT_TX_HASH = "INCORRECT_TX_HASH",
}

@ObjectType()
export class MintAsyncResponse {
  @Field(() => String, { nullable: true })
  txHash?: string | null;

  @Field()
  status!: MintAsyncStatus;

  @Field()
  message!: string;

  @Field(() => [String], { nullable: true })
  tokenIds?: string[];

  @Field(() => String, { nullable: true })
  contractAddress?: string | null;
}

@ObjectType()
export class MintStatusResponse {
  @Field(() => String, { nullable: true })
  txHash?: string | null;

  @Field()
  status!: MintAsyncStatus;

  @Field()
  message!: string;

  @Field(() => TransactionReceiptType, { nullable: true })
  receipt?: TransactionReceiptType;

  @Field(() => [String], { nullable: true })
  tokenIds?: string[];
}
