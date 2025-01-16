import { ObjectType, Field } from "type-graphql";
import { TransactionReceiptType } from "../..";

@ObjectType()
export class EvolveResponse {
  @Field()
  tokenId!: string;

  @Field()
  success!: boolean;

  @Field()
  tokenUri!: string;

  @Field()
  tx!: string;
}

@ObjectType()
export class EvolveBatchResponse {

  @Field()
  success!: boolean;

  @Field()
  tx!: string;

  @Field(() => [EvolveTokenResponse])
  tokens!: EvolveTokenResponse[];
}

@ObjectType()
export class EvolveTokenResponse {
  @Field()
  tokenId!: string;

  @Field(() => String, { nullable: true })
  tokenUri?: string;
}

export enum EvolveAsyncStatus {
  PENDING = "PENDING",
  SUCCESS = "SUCCESS",
  REVERTED = "REVERTED",
  NOT_FOUND = "NOT_FOUND",
  TRANSACTION_TYPE_MISTATCH = "TRANSACTION_TYPE_MISTATCH",
  INCORRECT_TX_HASH = "INCORRECT_TX_HASH",
}

@ObjectType()
export class EvolveAsyncResponse {
  
  @Field()
  status!: EvolveAsyncStatus;

  @Field()
  message!: string;
  @Field()
  txHash!: string;

  @Field(() => [String], { nullable: true })
  tokenIds?: string[];
}

@ObjectType()
export class EvolveStatusResponse {
  @Field(() => String, { nullable: true })
  txHash?: string | null;

  @Field()
  status!: EvolveAsyncStatus;

  @Field()
  message!: string;

  @Field(() => TransactionReceiptType, { nullable: true })
  receipt?: TransactionReceiptType;

  @Field(() => [String], { nullable: true })
  tokenIds?: string[];
}
