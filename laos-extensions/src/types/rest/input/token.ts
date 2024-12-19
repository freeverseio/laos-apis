import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsEnum, IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";

// Enum for sort order
export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum SortColumn {
  CREATED_AT = 'CREATED_AT',
}

export enum ChainId {
  ETHEREUM = '1',
  POLYGON = '137',
}

// SortBy class
export class SortBy {
  @IsString()
  @IsNotEmpty()
  @IsEnum(SortColumn)
  column!: SortColumn;

  @IsEnum(SortOrder)
  order!: SortOrder;
}

// Page class
class Page {
  @IsNumber()
  @IsOptional()
  page?: number;

  @IsString()
  @IsOptional()
  column?: string;

  @IsOptional()
  before?: object;

  @IsOptional()
  after?: object;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SortBy)
  sort?: SortBy[];

  @IsNumber()
  @IsOptional()
  pageSize?: number;

  @IsBoolean()
  @IsOptional()
  more?: boolean;
}

class MetadataOptions {
  // You can add specific fields for metadataOptions if needed
  @IsOptional()
  @IsString()
  exampleField?: string;
}

export class GetTokenBalancesInput {  
  @IsNotEmpty()
  @IsString()
  @IsIn(Object.values(ChainId), { 
    message: `chainId must be one of the following string values: ${Object.values(ChainId).join(', ')}` 
  })
  chainId!: ChainId;
  
  @IsNotEmpty()
  @IsString()
  accountAddress!: string;

  @IsString()
  @IsOptional()
  contractAddress?: string;
 
  @IsOptional()
  @IsBoolean()
  includeMetadata: boolean = false;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MetadataOptions) // Use this if you want to add nested validation for metadataOptions
  metadataOptions?: MetadataOptions;

  @IsOptional()
  @IsBoolean()
  verifiedOnly?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includeContracts?: string[];

  @IsOptional()
  @IsBoolean()
  includeCollectionTokens?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => Page)
  page?: Page;

}

export class TokenSupplyInput {
  @IsNotEmpty()
  @IsString()
  contractAddress!: string;

  @IsBoolean()
  includeMetadata!: boolean;

  @IsNotEmpty()
  @IsString()
  @IsIn(Object.values(ChainId), { 
    message: `chainId must be one of the following string values: ${Object.values(ChainId).join(', ')}` 
  })
  chainId!: ChainId;

  @IsOptional()
  @ValidateNested()
  @Type(() => Page)
  page?: Page;
}