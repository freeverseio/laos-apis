import { ApolloClient, gql, InMemoryCache } from "@apollo/client/core";
import { GqlClient } from "./GqlClient";
import { GetTokenBalancesInput, GetTokenBalancesQueryInput, GetTokenSuppliesQueryInput, SortBy, SortColumn, SortOrder, TokenIndexer, TokenResponse, TokenSupply, TokenSupplyInput } from "../../types";

export class TokenQuery {
  private gqlClient: GqlClient;

  constructor() {
    this.gqlClient = new GqlClient();
  }



  createQueryByOwner(input: GetTokenBalancesQueryInput) {
    return gql`
      query MyQuery {
        polygon {
          tokens(
            orderBy: ${input.orderBy || 'CREATED_AT_DESC'}
            pagination: {first: ${input.first} ${input.after ? `, after: "${input.after}"` : ''}}
            where: {${input.contractAddress ? `contractAddress: "${input.contractAddress}",` : ''} owner: "${input.owner}"}
          ) {
            totalCount
            edges {
              cursor
              node {
                tokenId
                contractAddress
                ${input.includeMetadata ? `
                attributes
                block_number
                createdAt
                description
                image
                initialOwner
                name
                owner
                tokenUri
                tokenUriFetchState
                ` : ''}
              }
            }
          }
        }
      }
    `;

  }

  createQueryTokens(input: GetTokenSuppliesQueryInput) {
    return gql`
      query MyQuery {
        polygon {
          tokens(
            where: {contractAddress: "${input.contractAddress}"}
            orderBy: ${input.orderBy || 'CREATED_AT_DESC'}
            pagination: {first: ${input.first} ${input.after ? `, after: "${input.after}"` : ''}}
          ) {
            totalCount
            edges {
              cursor
              node {
                tokenId         
                ${input.includeMetadata ? `
                attributes
                contractAddress
                block_number
                createdAt
                description
                image
                initialOwner
                name
                owner
                tokenUri
                tokenUriFetchState
                ` : ''}
              }
            }
          }
        }
      }
    `;
  }



  async fetchTokensByOwner(input: GetTokenBalancesInput): Promise<TokenResponse> {
    try {
      const sortBy = this.createSortBy(input.page?.sort || []);
      const query = this.createQueryByOwner({
        ...input,
        owner: input.accountAddress,
        first: input.page?.pageSize ?? 100,
        orderBy: sortBy,
      });
      const response = await this.gqlClient.query({
        query,
        fetchPolicy: 'no-cache',
      });
      const pageSize = input.page?.pageSize ? input.page?.pageSize : 100;
      const tokens: TokenIndexer[] = response.data.polygon.tokens.edges.map((edge: any) => {
        return {
          ...edge.node,
          blockNumber: edge.node.block_number,
        }
      });
      if (!response.data || response.data.polygon.tokens.edges.length === 0) {
        return {
          page: {
            after: "",
            pageSize: 0,
            more: false,
          },
          tokens: [],
        };
      }
      const after = response.data.polygon.tokens.edges[response.data.polygon.tokens.edges.length - 1].cursor;
      const totalCount = response.data.polygon.tokens.totalCount;
      const more = pageSize === response.data.polygon.tokens.edges.length;
      return {
        page: {
          after: after,
          pageSize: pageSize,
          more,
        },
        tokens: tokens,
      };
    } catch (error) {
      console.error('Error fetching token by owner:', error);
      throw new Error('Could not fetch token by owner.');
    }
  }

  async fetchTokens(body: TokenSupplyInput): Promise<TokenResponse> {
    try {
      const sortBy = this.createSortBy(body.page?.sort || []);
      const query = this.createQueryTokens({
        contractAddress: body.contractAddress,
        after: body.page?.after as string | undefined,
        first: body.page?.pageSize ?? 100,
        includeMetadata: body.includeMetadata,
        orderBy: sortBy,
      });
      console.log(query.loc?.source.body);
      const response = await this.gqlClient.query({
        query,
        fetchPolicy: 'no-cache',
      });
      if (!response.data || response.data.polygon.tokens.edges.length === 0) {
        return {
          page: {
            after: "",
            pageSize: 0,
            more: false,
          },
          tokens: [],
        };
      }
      const pageSize = body.page?.pageSize ? body.page?.pageSize : 100;
      const tokens: TokenIndexer[] = response.data.polygon.tokens.edges.map((edge: any) => edge.node);
      const after = response.data.polygon.tokens.edges[response.data.polygon.tokens.edges.length - 1].cursor;
      const totalCount = response.data.polygon.tokens.totalCount;
      const more = pageSize === response.data.polygon.tokens.edges.length;
      return {
        page: {
          after: after,
          pageSize: pageSize,
          more,
        },
        tokens: tokens,
      };
    } catch (error) {
      console.error('Error fetching tokens:', error);
      throw new Error('Could not fetch tokens.');
    }
  }

  private createSortBy(sortBy: SortBy[]) {
    return sortBy ? sortBy.map((sort) => `${sort.column}_${sort.order}`).join('_') : 'CREATED_AT_DESC';
  }
}