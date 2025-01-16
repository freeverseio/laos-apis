import { Resolver, Query, Mutation, Arg, Ctx  } from "type-graphql";
import { MintingService } from "../services/MintingService";
import { MintResponse, MintAsyncResponse, MintInput, MintStatusResponse } from "../types";

interface Context {
  headers: any;
}
@Resolver()
export class MintResolver {
  constructor(private mintingService: MintingService) {}

  @Query(() => String)
  async status() {
    return "Up";
  }

  @Mutation(() => MintResponse)
  async mint(@Arg("input") input: MintInput, @Ctx() context: Context): Promise<MintResponse> {
    let apiKey = context.headers['authorization'];
    //remove the API-KEY prefix
    apiKey = apiKey.replace('API-KEY ', '');
    return this.mintingService.mint(input, apiKey);
  }

  @Mutation(() => MintAsyncResponse)
  async mintAsync(@Arg("input") input: MintInput, @Ctx() context: Context): Promise<MintAsyncResponse> {
    let apiKey = context.headers['authorization'];
    //remove the API-KEY prefix
    apiKey = apiKey.replace('API-KEY ', '');
    return this.mintingService.mintAsync(input, apiKey);
  }

  @Query(() => MintStatusResponse)
  async mintResponse(@Arg("txHash") txHash: string): Promise<MintStatusResponse> {
    return this.mintingService.mintResponse(txHash);
  }
}